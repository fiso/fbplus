/** @jsx jsx */
import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { jsx } from '@emotion/react';
import './app.css';
import { isExternalLink } from '../shared/is-external-link';
import {
  flashbackThreadLink,
  formatDateAndTime,
} from '../shared/flashback-utils';
import { FlashbackThread } from '../shared/flashback-types';

const Link: FunctionComponent<React.ComponentProps<'a'>> = ({
  children,
  ...props
}) => (
  <a
    {...(props.href && isExternalLink(props.href)
      ? {
          target: '_blank',
          rel: 'noreferrer',
        }
      : {})}
    {...props}
  >
    {children}
  </a>
);

type FlashbackPostBodyProps = {
  children: string;
};

const FlashbackPostBody: FunctionComponent<FlashbackPostBodyProps> = ({
  children,
}) => (
  <div
    className="flashback-post-body"
    dangerouslySetInnerHTML={{ __html: children }}
  />
);

export const App: FunctionComponent = () => {
  const [fetching, setFetching] = useState(false);
  const [threadUrl, setThreadUrl] = useState('');
  const [thread, setThread] = useState<FlashbackThread>({
    pages: [],
    id: '',
    title: '',
    pagesAvailable: -1,
  });
  const { pagesAvailable } = thread;
  // Page number, not an index (so 1-based counting)
  const lastFetchedPage =
    thread.pages.length > 0
      ? thread.pages[thread.pages.length - 1].index + 1
      : -1;

  const appendContent = useCallback(
    (flashbackThread: FlashbackThread) => {
      setThread({
        ...flashbackThread,
        pages: [...thread.pages, ...flashbackThread.pages],
      });
    },
    [thread.pages]
  );

  const fetchPages = useCallback(
    (start?: number, pages?: number) => {
      start = start || 0;
      pages = pages || 3;

      if (lastFetchedPage >= start + pages || fetching) {
        return;
      }

      async function fetchThread() {
        console.info(`Fetching pages ${start} – ${start + pages}…`);
        setFetching(true);
        const result = await fetch(
          `/thread?url=${threadUrl}&start=${start}&pages=${pages}`
        );
        if (result.status !== 200) {
          console.error('Error fetching!');
          return;
        }
        appendContent(await result.json());
        setFetching(false);
      }

      fetchThread();
    },
    [appendContent, fetching, lastFetchedPage, threadUrl]
  );

  const [scrollThrottleTime, setScrollThrottleTime] = useState(0);

  const onScrollWindow = useCallback(() => {
    const now = Number(new Date());
    if (now < scrollThrottleTime) {
      return;
    }
    setScrollThrottleTime(now + 100);

    const scrollPosition =
      window.scrollY / (window.document.body.scrollHeight - window.innerHeight);
    if (scrollPosition > 0.9 && lastFetchedPage < pagesAvailable) {
      fetchPages(lastFetchedPage, 3);
    }
  }, [fetchPages, lastFetchedPage, pagesAvailable, scrollThrottleTime]);

  useEffect(() => {
    window.addEventListener('scroll', onScrollWindow, {
      passive: true,
    });

    return () => {
      window.removeEventListener('scroll', onScrollWindow);
    };
  }, [onScrollWindow]);

  useEffect(() => {
    if (!threadUrl || fetching) {
      return;
    }

    fetchPages();
  }, [fetchPages, fetching, threadUrl]);

  const onHashChange = useCallback(() => {
    setThreadUrl(document.location.hash.slice(1));
  }, []);

  useEffect(() => {
    setThreadUrl(document.location.hash.slice(1));
    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [onHashChange]);

  return (
    <main>
      <h1>
        <Link href={flashbackThreadLink(thread.id)}>{thread.title}</Link>
      </h1>
      {thread.pages.map((page) => (
        <React.Fragment key={page.index}>
          <h2 className="page-number">
            <Link href={flashbackThreadLink(thread.id, page.index)}>
              {page.index + 1} / {thread.pagesAvailable}
            </Link>
          </h2>
          {page.posts.map((post) => (
            <article key={post.id}>
              <header>
                <Link href={post.user.link}>{post.user.username}</Link>
                <time>
                  <Link href={post.link}>
                    {formatDateAndTime(post.timestamp)}
                  </Link>
                </time>
              </header>
              <FlashbackPostBody>{post.body}</FlashbackPostBody>
            </article>
          ))}
        </React.Fragment>
      ))}
    </main>
  );
};
