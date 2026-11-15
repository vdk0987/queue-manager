import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getErrorMessage, tokenApi } from "@/lib/api";
import type { QueueTokensData } from "@/types/token";

export type QueueTokensStatus = "loading" | "ready" | "error" | "not-found" | "invalid";

interface UseQueueTokensResult {
  data: QueueTokensData | null;
  status: QueueTokensStatus;
  error: string | null;
  /** Reloads without showing skeletons when data is already on screen. */
  refresh: () => void;
  /** Applies an authoritative response and invalidates any in-flight reload. */
  update: (updater: (current: QueueTokensData) => QueueTokensData) => void;
}

/** Loads and maintains a queue workspace: queue details, tokens and statistics. */
export function useQueueTokens(queueId: string | undefined): UseQueueTokensResult {
  const [data, setData] = useState<QueueTokensData | null>(null);
  const [status, setStatus] = useState<QueueTokensStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);
  const dataRef = useRef<QueueTokensData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Reset immediately when navigating between queues so one queue's tokens can
  // never appear under another queue's heading.
  useEffect(() => {
    requestRef.current += 1;
    setData(null);
    setStatus("loading");
    setError(null);
  }, [queueId]);

  useEffect(() => {
    if (!queueId) {
      setStatus("not-found");
      return;
    }

    const controller = new AbortController();
    const requestId = (requestRef.current += 1);

    setError(null);
    setStatus((current) => (current === "ready" ? "ready" : "loading"));

    tokenApi
      .listForQueue(queueId, { signal: controller.signal })
      .then(({ data: workspace }) => {
        if (controller.signal.aborted || requestId !== requestRef.current) return;
        setData(workspace);
        setStatus("ready");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || requestId !== requestRef.current) return;
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;

        if (requestError instanceof ApiError) {
          if (requestError.status === 404 || requestError.code === "QUEUE_NOT_FOUND") {
            setData(null);
            setStatus("not-found");
            return;
          }

          if (requestError.status === 400) {
            setData(null);
            setStatus("invalid");
            return;
          }
        }

        setError(getErrorMessage(requestError));

        // A failed background refresh must not replace a usable screen with an
        // error page. Keep the last good snapshot and let the page surface it.
        setStatus(dataRef.current ? "ready" : "error");
      });

    return () => controller.abort();
  }, [queueId, reloadKey]);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const update = useCallback((updater: (current: QueueTokensData) => QueueTokensData) => {
    // Any reload that started before this mutation could overwrite newer state.
    requestRef.current += 1;
    setError(null);
    setData((current) => (current ? updater(current) : current));
  }, []);

  return { data, status, error, refresh, update };
}
