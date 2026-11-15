import type { QueueStatus } from "@prisma/client";

/** The queue columns that may leave the API. Ownership is never trusted from input. */
export const publicQueueSelect = {
  id: true,
  name: true,
  code: true,
  status: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      tokens: {
        where: { status: "WAITING" },
      },
    },
  },
} as const;

export interface PublicQueue {
  id: string;
  name: string;
  code: string;
  status: QueueStatus;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A selected queue plus the relation counts needed to build the response. */
export interface CountedQueue extends PublicQueue {
  _count: {
    tokens: number;
  };
}

export interface QueueResponse extends PublicQueue {
  waitingCount: number;
}

export function toQueueResponse(queue: CountedQueue): QueueResponse {
  return {
    id: queue.id,
    name: queue.name,
    code: queue.code,
    status: queue.status,
    timezone: queue.timezone,
    createdAt: queue.createdAt,
    updatedAt: queue.updatedAt,
    waitingCount: queue._count.tokens,
  };
}
