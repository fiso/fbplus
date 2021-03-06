/** @jsx jsx */
import {
  ComponentProps,
  Fragment,
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
  flashbackUrl,
  formatDateAndTime,
} from '../shared/flashback-utils';
import { FlashbackThread } from '../shared/flashback-types';

const Link: FunctionComponent<ComponentProps<'a'>> = ({
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

const Dots: FunctionComponent = () => {
  const maxDots = 3;
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const interval = setInterval(
      () => setDots(dots < maxDots ? dots + 1 : 0),
      200
    );

    return () => {
      clearInterval(interval);
    };
  }, [dots]);

  return (
    <Fragment>
      {[...new Array(maxDots)].map((_, i) => (
        <span
          key={i}
          style={{
            opacity: i < dots ? 1 : 0,
          }}
        >
          .
        </span>
      ))}
    </Fragment>
  );
};

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

function filterHash(hash: string) {
  return hash.split('#')[0];
}

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

  // https://www.flashback.org/p78504587#p78504587
  const fetchPages = useCallback(
    (_start?: number, _pages?: number) => {
      const start = _start || 0;
      const pages = _pages || 3;

      if (lastFetchedPage >= start + pages || fetching) {
        return;
      }

      async function fetchThread() {
        console.info(`Fetching pages ${start} ??? ${start + pages}???`);
        setFetching(true);
        try {
          const result = await fetch(
            `/thread?url=${threadUrl}&start=${start}&pages=${pages}`
          );
          if (result.status !== 200) {
            console.error('HTTP status ' + result.status);
            return;
          }
          appendContent(await result.json());
        } catch {
          console.error('Error fetching!');
        } finally {
          // setFetching(false);
        }
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
    const hash = filterHash(document.location.hash.slice(1));
    document.location.hash = hash;
    setThreadUrl(document.location.hash.slice(1));
    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [onHashChange]);

  const onClickUrlPrefix = useCallback((e) => {
    navigator.clipboard.writeText(e.currentTarget.innerText);
    const confirmation = document.createElement('div');
    confirmation.classList.add('copy-confirmation');
    console.log(e.currentTarget);
    e.currentTarget.appendChild(confirmation);
    setTimeout(() => confirmation.classList.add('disappear'), 0);
    setTimeout(() => confirmation.remove(), 5000);
  }, []);

  const exampleLink = `${location.origin}#${flashbackUrl}/t3357499`;

  const onChangeUrl = useCallback((e) => {
    document.location.hash = filterHash(e.currentTarget.value);
    window.dispatchEvent(new Event('hashchange', { bubbles: true }));
  }, []);

  return (
    <main className={fetching ? 'fetching' : ''}>
      {thread.id ? (
        <Fragment>
          <h1>
            <Link href={flashbackThreadLink(thread.id)}>{thread.title}</Link>
          </h1>
          {thread.pages.map((page) => (
            <Fragment key={page.index}>
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
            </Fragment>
          ))}
        </Fragment>
      ) : (
        <div className="nothread">
          <p>Klistra in en l??nk till en Flashback-tr??d h??r</p>
          <input autoFocus placeholder="L??nk" onChange={onChangeUrl} />
          <p className="moreinfo">
            Alternativt kan du klistra/skriva in{' '}
            <code onClick={onClickUrlPrefix}>{location.origin}#</code> direkt i
            addressf??ltet, framf??r en Flashback-tr??d. S?? att det ser ut s?? h??r:{' '}
            <Link href={exampleLink}>
              <code>{exampleLink}</code>
            </Link>
          </p>
        </div>
      )}
      <div
        className="loading"
        {...(fetching
          ? {}
          : {
              'aria-hidden': true,
            })}
      >
        H??mtar sidor{fetching && <Dots />}
      </div>
    </main>
  );
};
