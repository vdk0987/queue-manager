import { useEffect } from "react";
import { io } from "socket.io-client";

type QueueEvent =
  | "token:created"
  | "token:reordered"
  | "token:cancelled"
  | "service:started"
  | "service:completed"
  | "queue:updated";

const REALTIME_URL = (import.meta.env.VITE_API_URL ?? window.location.origin).replace(/\/+$/, "");

/**
 * Subscribes to authoritative queue changes. Events only invalidate the local
 * snapshot; REST remains the source of truth and handles all mutations.
 */
export function useQueueRealtime(queueId: string | undefined, onQueueChanged: () => void): void {
  useEffect(() => {
    if (!queueId) return;

    const socket = io(REALTIME_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    const joinQueue = () => {
      socket.emit("queue:join", queueId);
      onQueueChanged();
    };

    const handleEvent = (payload: { queueId?: string }) => {
      if (payload.queueId === queueId) {
        onQueueChanged();
      }
    };

    socket.on("connect", joinQueue);

    const events: QueueEvent[] = [
      "token:created",
      "token:reordered",
      "token:cancelled",
      "service:started",
      "service:completed",
      "queue:updated",
    ];

    for (const event of events) {
      socket.on(event, handleEvent);
    }

    return () => {
      socket.emit("queue:leave", queueId);
      for (const event of events) {
        socket.off(event, handleEvent);
      }
      socket.off("connect", joinQueue);
      socket.disconnect();
    };
  }, [queueId, onQueueChanged]);
}
