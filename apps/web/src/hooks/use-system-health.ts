import { useCallback, useEffect, useState } from "react";
import { systemApi } from "@/lib/api";
import type { HealthResponse } from "@/types/auth";

type HealthState = "loading" | "online" | "offline";

interface SystemHealth {
  state: HealthState;
  data: HealthResponse | null;
  checkedAt: Date | null;
  refresh: () => void;
}

export function useSystemHealth(): SystemHealth {
  const [state, setState] = useState<HealthState>("loading");
  const [data, setData] = useState<HealthResponse | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  const refresh = useCallback(() => {
    setState((current) => (current === "online" ? current : "loading"));
    setRequestKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    systemApi
      .health(controller.signal)
      .then((health) => {
        if (controller.signal.aborted) return;
        setData(health);
        setState("online");
        setCheckedAt(new Date());
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setData(null);
        setState("offline");
        setCheckedAt(new Date());
      });

    const interval = window.setInterval(() => {
      setRequestKey((key) => key + 1);
    }, 60_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [requestKey]);

  return { state, data, checkedAt, refresh };
}
