import { useEffect, useRef, useState } from "react";

// Loads data when the page opens or when `deps` change.
//   fetcher = (signal) => promise   (for example: (signal) => getProduct(id, signal))
//   deps    = an array of simple values (strings, numbers) that decide WHICH request this is
// Returns { data, error, loading, reload }. An old request is cancelled when a new one starts,
// so a slow answer can never overwrite a newer one.
export const useApi = (fetcher, deps) => {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });

  // "key" identifies the current request. We are loading until an answer for THIS key has arrived.
  const key = `${JSON.stringify(deps)}#${reloadCount}`;

  // keep the newest fetcher without making the effect run again on every render
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    const controller = new AbortController();
    fetcherRef
      .current(controller.signal)
      .then((data) => setResult({ key, data, error: null }))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setResult({ key, data: null, error: err });
      });
    return () => controller.abort();
  }, [key]);

  const loading = result.key !== key;
  return {
    data: loading ? null : result.data,
    error: loading ? null : result.error, // an ApiError (has .message and .status)
    loading,
    reload: () => setReloadCount((n) => n + 1),
  };
};
