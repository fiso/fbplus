/** @jsx jsx */
import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { jsx } from "@emotion/react";
import "./app.css";

type ThreadResponse = {
  html: string;
  pagesAvailable: number;
};

export const App: FunctionComponent = () => {
  const [pagesAvailable, setPagesAvailable] = useState(1);
  const [lastFetchedPage, setLastFetchedPage] = useState(-1);
  const [fetching, setFetching] = useState(false);
  const [markup, setMarkup] = useState("");
  const threadUrl = document.location.hash.slice(1);

  const appendContent = useCallback(
    (threadResponse: ThreadResponse) => {
      setMarkup(markup + threadResponse.html);
      setPagesAvailable(threadResponse.pagesAvailable);
    },
    [markup]
  );

  const fetchPages = useCallback(
    (start?: number, pages?: number) => {
      start = start || 0;
      pages = pages || 3;
      async function fetchThread() {
        console.log("Fetching...", start, pages);
        setFetching(true);
        const result = await fetch(
          `/thread?url=${threadUrl}&start=${start}&pages=${pages}`
        );
        if (result.status !== 200) {
          console.error("Error fetching!");
          return;
        }
        appendContent(await result.json());
        setLastFetchedPage(start + pages);
        setFetching(false);
      }

      fetchThread();
    },
    [lastFetchedPage]
  );

  const onScrollWindow = useCallback(() => {
    if (fetching) {
      return;
    }

    const scrollPosition =
      window.scrollY / (window.document.body.scrollHeight - window.innerHeight);
    if (scrollPosition > 0.9 && lastFetchedPage < pagesAvailable) {
      fetchPages(lastFetchedPage + 1, 3);
    }
  }, [fetching, lastFetchedPage, pagesAvailable]);

  useEffect(() => {
    window.addEventListener("scroll", onScrollWindow, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScrollWindow);
    };
  }, [onScrollWindow]);

  useEffect(() => {
    console.log(">> INITIAL FETCH");
    fetchPages();
  }, []);

  return <main dangerouslySetInnerHTML={{ __html: markup }}></main>;
};
