import express from 'express';
import axios from 'axios';
import { Iconv } from 'iconv';
import assert from 'assert';
import { parse } from 'node-html-parser';
import {
  FlashbackPost,
  FlashbackThread,
  FlashbackThreadPage,
} from '../shared/flashback-types';
import { flashbackUrl, formatDate } from '../shared/flashback-utils';

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
    method: 'GET',
    url,
    responseType: 'arraybuffer',
  });

  const iconv = new Iconv('ISO-8859-1', 'UTF-8');
  const buffer = iconv.convert(response.data);
  return String(buffer);
}

async function fetchPosts(
  url: string,
  html?: string
): Promise<FlashbackPost[]> {
  const cacheKey = 'fetchPosts' + url;
  const cached = fromCache<FlashbackPost[]>(cacheKey);
  if (cached) {
    return cached;
  }
  html = html || (await fetchAndReencode(url));
  const doc = parse(html);
  const postElements = doc.querySelectorAll('[data-postid]');
  const posts = postElements.map((pe) => {
    const body = pe.querySelector('.post_message');
    const id = pe.attributes['data-postid'];
    const usernameEl = pe.querySelector('.post-user-username');
    const username = usernameEl?.innerText.trim();
    const userLink = usernameEl?.attributes.href;
    const timestamp = pe.querySelector('.post-heading')?.innerText.trim();
    const link = pe.querySelector('[target="new"]')?.attributes.href;
    assert(body && timestamp && username && userLink && link);
    const relevantPart = timestamp.slice(0, timestamp.indexOf('\n'));
    const parts = relevantPart.split(',').map((s) => s.trim());
    let dateText = parts[0];
    const timeText = parts[1];
    if (dateText.toLocaleUpperCase().startsWith('IG&ARING;R')) {
      dateText = formatDate(
        Number(new Date(Number(new Date()) - 24 * 60 * 60 * 1000))
      );
    } else if (dateText.toLocaleUpperCase().startsWith('IDAG')) {
      dateText = formatDate(Number(new Date()));
    }
    const d = new Date(`${dateText}, ${timeText}`);
    for (const link of body.querySelectorAll('[href]')) {
      link.setAttribute(
        'href',
        decodeURIComponent(link.attributes.href.replace('/leave.php?u=', ''))
      );
      if (link.attributes.href.startsWith('/')) {
        link.setAttribute('href', flashbackUrl + link.attributes.href);
      }
      if (link.querySelector('i[class~="glyphicon-arrow-left"]')) {
        link.setAttribute('title', 'Visa originalinl??gg');
      }

      link.setAttribute('rel', 'noreferrer');
    }
    return {
      id,
      body: body.toString(),
      user: {
        username,
        link: flashbackUrl + userLink,
      },
      timestamp: Number(d),
      link: flashbackUrl + link,
    };
  });

  storeInCache(cacheKey, posts);
  return posts;
}

async function fetchThread(
  url: string,
  firstPage?: number,
  maxPages?: number
): Promise<FlashbackThread> {
  firstPage = firstPage || 0;
  const baseUrl = url.replace(/p\d+$/gms, ''); // Strip any page offset
  url = `${baseUrl}p${firstPage + 1}`;
  const cacheKey = 'fetchThread' + url + firstPage + maxPages;
  const cached = fromCache<FlashbackThread>(cacheKey);
  if (cached) {
    return cached;
  }
  const thread = {
    id: '',
    title: '',
    pages: [] as FlashbackThreadPage[],
    pagesAvailable: 0,
  };

  const html = await fetchAndReencode(url);
  const doc = parse(html);

  console.log({ url });
  const threadLink = doc.querySelector('.page-title h1 a');
  console.log(threadLink?.attributes);
  const threadId = threadLink?.attributes['href']?.replace(/^\/t/g, '');
  if (!threadId) {
    throw new Error('Failed to find thread id');
  }
  thread.id = threadId;
  console.log(thread.id);

  const totalPages = doc.querySelector('[data-total-pages]');
  thread.pagesAvailable = Number(
    totalPages?.attributes['data-total-pages'] || 1
  );

  const ogTitle = doc.querySelector("[property='og:title']");
  if (!ogTitle) {
    throw new Error('Failed to find for og:title');
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
      baseUrl + 'p' + String(pageNumber + 1),
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

const app = express();

app.get('/thread', async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const threadUrl = req.query.url;
  console.log('Got req for', threadUrl);
  const startPage = Number(req.query.start || 0);
  const pages = req.query.pages ? Number(req.query.pages) : undefined;

  if (typeof threadUrl !== 'string' || !threadUrl) {
    res.statusCode = 400;
    res.end();
    return;
  }

  try {
    const thread = await fetchThread(threadUrl, startPage, pages);
    res.json(thread);
  } catch (e) {
    console.error('Error fetching!');
    console.error(e);
    res.statusCode = 500;
    res.end();
  }
});

app.listen(3000);
