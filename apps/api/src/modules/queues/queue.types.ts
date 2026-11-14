import type { QueueStatus } from "@prisma/client";

/** The queue columns that may leave the API. Ownership is never trusted from input. */
export const publicQueueSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface PublicQueue {
  id: string;
  name: string;
  status: QueueStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueResponse extends PublicQueue {
  /** Tokens arrive in Phase 3; until then every queue reports zero waiting. */
  waitingCount: number;
}

export function toQueueResponse(queue: PublicQueue): QueueResponse {
  return {
    id: queue.id,
    name: queue.name,
    status: queue.status,
    createdAt: queue.createdAt,
    updatedAt: queue.updatedAt,
    waitingCount: 0,
  };
}
