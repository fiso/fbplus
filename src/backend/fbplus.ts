import express from "express";
import axios from "axios";
import { Iconv } from "iconv";
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
  link: string;
};

type FlashbackPost = {
  id: string;
  body: string;
  timestamp: number;
  user: FlashbackUser;
  link: string;
};

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
    const usernameEl = pe.querySelector(".post-user-username");
    const username = usernameEl?.innerText.trim();
    const userLink = usernameEl?.attributes.href;
    const timestamp = pe.querySelector(".post-heading")?.innerText.trim();
    const link = pe.querySelector("[target='new']")?.attributes.href;
    assert(body && timestamp && username && userLink && link);
    const relevantPart = timestamp.slice(0, timestamp.indexOf("\n"));
    let [dateText, timeText] = relevantPart.split(",").map((s) => s.trim());
    if (dateText.toLocaleUpperCase().startsWith("IG&ARING;R")) {
      dateText = formatDate(
        Number(new Date(Number(new Date()) - 24 * 60 * 60 * 1000))
      );
    } else if (dateText.toLocaleUpperCase().startsWith("IDAG")) {
      dateText = formatDate(Number(new Date()));
    }
    const d = new Date(`${dateText}, ${timeText}`);
    for (const link of body.querySelectorAll("[href]")) {
      link.setAttribute(
        "href",
        decodeURIComponent(link.attributes.href.replace("/leave.php?u=", ""))
      );
      if (link.attributes.href.startsWith("/")) {
        link.setAttribute(
          "href",
          "https://www.flashback.org" + link.attributes.href
        );
      }
      if (link.querySelector("i[class~='glyphicon-arrow-left']")) {
        link.setAttribute("title", "Visa originalinlägg");
      }

      link.setAttribute("rel", "noreferrer");
    }
    return {
      id,
      body: body.toString(),
      user: {
        username,
        link: "https://www.flashback.org" + userLink,
      },
      timestamp: Number(d),
      link: "https://www.flashback.org" + link,
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

  const totalPages = doc.querySelector("[data-total-pages]");
  thread.pagesAvailable = Number(
    totalPages?.attributes["data-total-pages"] || 1
  );

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
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDateAndTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${formatDate(timestamp)}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function flashbackThreadLink(threadId: string, pageIndex?: number) {
  return `https://www.flashback.org/t${threadId}${
    typeof pageIndex === "number" ? `p${pageIndex + 1}` : ""
  }`;
}

function renderThreadBody(thread: FlashbackThread): string {
  return `
${
  thread.pages[0].index === 0
    ? `<h1><a href="${flashbackThreadLink(
        thread.id
      )}" target="_blank" rel="noreferrer">${thread.title}</a></h1>`
    : ""
}${thread.pages
    .map(
      (page) => `
<h2 class="page-number"><a href="${flashbackThreadLink(
        thread.id,
        page.index
      )}" target="_blank" rel="noreferrer">${page.index + 1} / ${
        thread.pagesAvailable
      }</a></h2>${page.posts
        .map(
          (post) => `
<article>
<header>
  <a href="${post.user.link}" target="_blank" rel="noreferrer">${
            post.user.username
          }</a>
  <time><a href="${
    post.link
  }" target="_blank" rel="noreferrer">${formatDateAndTime(
            post.timestamp
          )}</a></time>
</header>
${post.body}
</article>`
        )
        .join("")}`
    )
    .join("")}`;
}

const app = express();

app.get("/thread", async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
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
