import express from "express";
import axios from "axios";
import { Iconv } from "iconv";
import fs from "fs";
import assert from "assert";
import { parse } from "node-html-parser";

const cache: {
  [key: string]:
    | undefined
    | {
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

type FlashbackUser = {
  username: string;
};

type FlashbackPost = {
  id: string;
  body: string;
  timestamp: number;
  user: FlashbackUser;
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
  const doc = parse(html);
  const postElements = doc.querySelectorAll("[data-postid]");
  const posts = postElements.map((pe) => {
    const body = pe.querySelector(".post_message");
    const id = pe.attributes["data-postid"];
    const username = pe.querySelector(".post-user-username")?.innerText.trim();
    const timestamp = pe.querySelector(".post-heading")?.innerText.trim();
    assert(body && timestamp && username);
    const d = new Date(timestamp.slice(0, timestamp.indexOf("\n")));
    return {
      id,
      body: fixLinks(body.toString()),
      user: {
        username,
      },
      timestamp: Number(d),
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
  const baseUrl = url.replace(/p\d+$/gms, ""); // Strip any page offset
  url = `${baseUrl}p${firstPage + 1}`;
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
  const doc = parse(html);

  let result = /\/t(?<threadId>.*?)(p|$)/gms.exec(url);
  if (!result?.groups?.threadId) {
    throw new Error("Failed to find thread id");
  }
  thread.id = result.groups.threadId;

  thread.pagesAvailable = 1;

  const lastLink = doc.querySelector(".last a");
  const href = lastLink?.attributes.href;
  if (href) {
    result = /\/t(?<threadId>.*?)p(?<pages>.*)/gms.exec(href);
    if (!result?.groups) {
      throw new Error("Failed to find result.groups for pages");
    }
    thread.pagesAvailable = Number(result.groups.pages);
  }

  const ogTitle = doc.querySelector("[property='og:title']");
  if (!ogTitle) {
    throw new Error("Failed to find for og:title");
  }
  thread.title = ogTitle.attributes.content;

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
      baseUrl + "p" + String(pageNumber + 1),
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

const p = (n: number) => String(n).padStart(2, "0");

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}, ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

function renderThreadBody(thread: FlashbackThread): string {
  return `
${thread.pages[0].index === 0 ? `<h1>${thread.title}</h1>` : ""}${thread.pages
    .map(
      (page) => `
<h2 class="page-number"><span>${page.index + 1} / ${
        thread.pagesAvailable
      }</span></h2>${page.posts
        .map(
          (post) => `
<article>
<header>
  <span>${post.user.username}</span>
  <time>${formatDate(post.timestamp)}</time>
</header>
${post.body}
</article>`
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
    const html = renderThreadBody(thread);
    res.json({
      html,
      pagesAvailable: thread.pagesAvailable,
    });
  } catch (e) {
    console.error("Error fetching!");
    console.error(e);
    res.statusCode = 500;
    res.end();
  }
});

app.listen(3000);
