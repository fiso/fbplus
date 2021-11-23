import express, { Response } from "express";
import axios from "axios";
import { Iconv } from "iconv";
import fs from "fs";
import assert from "assert";

const cache: {
  [key: string]: undefined | {
    timestamp: number;
    obj: unknown;
  };
} = {};

const maxCacheAge = 1000 * 60 * 10; // 10 minutes

function fromCache<T>(key: string): T | undefined {
  const item = cache[key];
  if (!item) {
    return undefined;
  }

  const now = Number(new Date());
  if (now - item.timestamp > maxCacheAge) {
    delete cache[key];
    return undefined;
  }

  return item.obj as T;
}

function storeInCache(key: string, obj: unknown): void {
  cache[key] = {
    timestamp: Number(new Date()),
    obj,
  };
}

async function fetchAndReencode(url: string): Promise<string> {
  const response = await axios({
    method: "GET",
    url,
    responseType: "arraybuffer",
  });

  const iconv = new Iconv("ISO-8859-1", "UTF-8");
  const buffer = iconv.convert(response.data);
  return String(buffer);
}

type FlashbackPost = {
  id: string;
  body: string;
};

function fixLinks(html: string): string {
  const rx = /<a [^>]*?"\/leave.php\?u=(?<url>.*?)"/gms;
  return html.replace(
    rx,
    (
      match: string,
      _ps: string[],
      _offset: number,
      _whole: string,
      groups: {
        [key: string]: string;
      }
    ) => {
      if (!groups?.url) {
        return match;
      }
      return decodeURIComponent(match.replace("/leave.php?u=", ""));
    }
  );
}

async function fetchPosts(
  url: string,
  html?: string
): Promise<FlashbackPost[]> {
  const cacheKey = "fetchPosts" + url;
  const cached = fromCache<FlashbackPost[]>(cacheKey);
  if (cached) {
    return cached;
  }
  html = html || (await fetchAndReencode(url));
  const rx = /class="post_message".*?id="(?<postId>.*?)"/gms;
  const posts = [...html.matchAll(rx)].map((match) => {
    assert(html);
    let closingTagsNeeded = 1;
    let endIndex = -1;
    let search = match.index;

    while (endIndex < 0) {
      const nextClosingTagIndex = html.indexOf("/div", search);
      const nextOpeningTagIndex = html.indexOf("<div", search);

      if (nextOpeningTagIndex < nextClosingTagIndex) {
        closingTagsNeeded++;
        search = nextOpeningTagIndex + 1;
      }

      if (nextClosingTagIndex < nextOpeningTagIndex) {
        closingTagsNeeded--;
        if (closingTagsNeeded < 1) {
          endIndex = nextClosingTagIndex - 1;
        } else {
          search = nextClosingTagIndex + 1;
        }
      }
    }

    const start = html.indexOf(">", match.index) + 1;

    return {
      id: match.groups?.postId || "UNKNOWN",
      body: fixLinks(html.slice(start, endIndex).trim()),
    };
  });
  storeInCache(cacheKey, posts);
  return posts;
}

type FlashbackThreadPage = {
  index: number;
  posts: FlashbackPost[];
};

type FlashbackThread = {
  id: string;
  title: string;
  pages: FlashbackThreadPage[];
  pagesAvailable: number;
};

async function fetchThread(
  url: string,
  firstPage?: number,
  maxPages?: number
): Promise<FlashbackThread> {
  firstPage = firstPage || 0;
  url = url.replace(/p\d+$/gms, ""); // Strip any page offset
  const cacheKey = "fetchThread" + url + firstPage + maxPages;
  const cached = fromCache<FlashbackThread>(cacheKey);
  if (cached) {
    return cached;
  }
  const thread = {
    id: "",
    title: "",
    pages: [] as FlashbackThreadPage[],
    pagesAvailable: 0,
  };
  const html = await fetchAndReencode(url);
  let result = /class="last".*?href="(?<href>.*?)"/gms.exec(html);
  const href = result?.groups?.href;
  if (!href) {
    return thread;
  }

  result = /\/t(?<threadId>.*?)p(?<pages>.*)/gms.exec(href);
  if (!result?.groups) {
    return thread;
  }
  thread.id = result.groups.threadId;
  thread.pagesAvailable = Number(result.groups.pages);

  result = /property="og:title" content="(?<title>.*)"/.exec(html);
  if (!result?.groups) {
    return thread;
  }
  thread.title = result.groups.title;

  maxPages = Math.min(
    thread.pagesAvailable - firstPage,
    maxPages ? maxPages : Number.MAX_SAFE_INTEGER
  );

  for (
    let pageNumber = firstPage;
    pageNumber < firstPage + maxPages;
    pageNumber++
  ) {
    const posts = await fetchPosts(
      url + "p" + String(pageNumber + 1),
      pageNumber === firstPage ? html : undefined
    );
    thread.pages.push({
      index: pageNumber,
      posts,
    });
  }

  storeInCache(cacheKey, thread);

  return thread;
}

function renderThreadBody(thread: FlashbackThread): string {
  return `
${thread.pages[0].index === 0 ? `<h1>${thread.title}</h1>` : ""}${thread.pages
    .map(
      (page) => `
<h2 class="page-number">Sida ${page.index + 1}</h2>${page.posts
        .map(
          (post) => `
<article>${post.body}</article>`
        )
        .join("")}`
    )
    .join("")}`;
}

const app = express();

const indexDocument = String(fs.readFileSync("./assets/index.html"));
const style = String(fs.readFileSync("./assets/style.css"));

app.get("/style.css", function (_req, res) {
  res.set("Content-Type", "text/css");
  res.send(style);
});

app.get("/", function (_req, res) {
  res.send(indexDocument);
});

app.get("/thread", async function (req, res) {
  const threadUrl = req.query.url;
  const startPage = Number(req.query.start || 0);
  const pages = req.query.pages ? Number(req.query.pages) : undefined;

  if (typeof threadUrl !== "string" || !threadUrl) {
    res.statusCode = 400;
    res.end();
    return;
  }

  try {
    const thread = await fetchThread(threadUrl, startPage, pages);
    const markup = renderThreadBody(thread);
    res.send(markup);
  } catch (e) {
    console.error("Error fetching!");
    res.statusCode = 500;
    res.end();
  }
});

app.listen(3000);
