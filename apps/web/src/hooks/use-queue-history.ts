import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getErrorMessage, tokenApi } from "@/lib/api";
import type { HistoryStatusFilter, QueueHistoryData } from "@/types/token";

export type QueueHistoryLoadStatus = "loading" | "ready" | "error" | "not-found";

interface UseQueueHistoryResult {
  data: QueueHistoryData | null;
  status: QueueHistoryLoadStatus;
  error: string | null;
  isFetching: boolean;
  page: number;
  statusFilter: HistoryStatusFilter;
  setPage: (page: number) => void;
  setStatusFilter: (status: HistoryStatusFilter) => void;
  refresh: () => void;
}

const PAGE_SIZE = 8;

/** Loads paginated completed/cancelled history for a queue. */
export function useQueueHistory(queueId: string, refreshKey = 0): UseQueueHistoryResult {
  const [data, setData] = useState<QueueHistoryData | null>(null);
  const [status, setStatus] = useState<QueueHistoryLoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [page, setPageState] = useState(1);
  const [statusFilter, setStatusFilterState] = useState<HistoryStatusFilter>("ALL");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);
  const dataRef = useRef<QueueHistoryData | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    requestRef.current += 1;
    setData(null);
    setStatus("loading");
    setError(null);
    setPageState(1);
    setStatusFilterState("ALL");
  }, [queueId]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = (requestRef.current += 1);

    setIsFetching(true);
    setError(null);

    if (!dataRef.current) {
      setStatus("loading");
    }

    tokenApi
      .history(queueId, {
        status: statusFilter,
        page,
        limit: PAGE_SIZE,
        signal: controller.signal,
      })
      .then(({ data: history }) => {
        if (controller.signal.aborted || requestId !== requestRef.current) return;
        setData(history);
        setStatus("ready");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || requestId !== requestRef.current) return;
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;

        if (requestError instanceof ApiError && requestError.status === 404) {
          setData(null);
          setStatus("not-found");
          return;
        }

        setError(getErrorMessage(requestError));
        setStatus(dataRef.current ? "ready" : "error");
      })
      .finally(() => {
        if (controller.signal.aborted || requestId !== requestRef.current) return;
        setIsFetching(false);
      });

    return () => controller.abort();
  }, [queueId, page, statusFilter, refreshKey, reloadKey]);

  const setPage = useCallback((nextPage: number) => {
    setPageState(Math.max(1, nextPage));
  }, []);

  const setStatusFilter = useCallback((nextStatus: HistoryStatusFilter) => {
    setStatusFilterState(nextStatus);
    setPageState(1);
  }, []);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return {
    data,
    status,
    error,
    isFetching,
    page,
    statusFilter,
    setPage,
    setStatusFilter,
    refresh,
  };
}
