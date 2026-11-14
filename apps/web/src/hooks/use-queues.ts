import { useCallback, useEffect, useState } from "react";
import { getErrorMessage, queueApi } from "@/lib/api";
import type { Queue } from "@/types/queue";

type QueueListStatus = "loading" | "ready" | "error";

interface UseQueuesResult {
  queues: Queue[];
  status: QueueListStatus;
  error: string | null;
  refresh: () => void;
  addQueue: (queue: Queue) => void;
  replaceQueue: (queue: Queue) => void;
}

/** Loads the authenticated manager's queues and keeps local updates in sync. */
export function useQueues(): UseQueuesResult {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [status, setStatus] = useState<QueueListStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setError(null);
    setStatus((current) => (current === "ready" ? "ready" : "loading"));

    queueApi
      .list(controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setQueues(data);
        setStatus("ready");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(getErrorMessage(requestError));
        setStatus("error");
      });

    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const addQueue = useCallback((queue: Queue) => {
    setQueues((current) => [queue, ...current]);
  }, []);

  const replaceQueue = useCallback((queue: Queue) => {
    setQueues((current) => current.map((item) => (item.id === queue.id ? queue : item)));
  }, []);

  return { queues, status, error, refresh, addQueue, replaceQueue };
}
