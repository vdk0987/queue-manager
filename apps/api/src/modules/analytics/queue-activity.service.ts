import type { Prisma } from "@prisma/client";

/**
 * Every event that can change (or explain) the waiting line. Events are
 * append-only: nothing in the application updates or deletes a saved activity.
 */
export const QUEUE_EVENT = {
  TOKEN_CREATED: "TOKEN_CREATED",
  TOKEN_REORDERED: "TOKEN_REORDERED",
  TOKEN_CANCELLED: "TOKEN_CANCELLED",
  SERVICE_STARTED: "SERVICE_STARTED",
  SERVICE_COMPLETED: "SERVICE_COMPLETED",
  QUEUE_ACTIVATED: "QUEUE_ACTIVATED",
  QUEUE_DEACTIVATED: "QUEUE_DEACTIVATED",
} as const;

export type QueueEventType = (typeof QUEUE_EVENT)[keyof typeof QUEUE_EVENT];

/**
 * How each event moves the number of people waiting.
 *
 * TOKEN_CREATED      joins the line       +1
 * SERVICE_STARTED    leaves the line      -1
 * TOKEN_CANCELLED    leaves the line      -1
 * SERVICE_COMPLETED  already left at start  0
 * TOKEN_REORDERED    same number of people  0
 * QUEUE_*            lifecycle only         0
 */
export const WAITING_COUNT_DELTA: Record<QueueEventType, number> = {
  TOKEN_CREATED: 1,
  TOKEN_REORDERED: 0,
  TOKEN_CANCELLED: -1,
  SERVICE_STARTED: -1,
  SERVICE_COMPLETED: 0,
  QUEUE_ACTIVATED: 0,
  QUEUE_DEACTIVATED: 0,
};

export interface RecordQueueActivityInput {
  queueId: string;
  eventType: QueueEventType;
  tokenId?: string | null;
  metadata?: Prisma.InputJsonValue;
  /** Defaults to now(). Only used by historical backfills and tests. */
  createdAt?: Date;
}

/**
 * Appends an activity row inside the caller's transaction. Call this only after
 * the corresponding mutation succeeded, so failed or repeated requests never
 * leave a phantom event behind.
 */
export async function recordQueueActivity(
  tx: Prisma.TransactionClient,
  input: RecordQueueActivityInput,
): Promise<void> {
  await tx.queueActivity.create({
    data: {
      queueId: input.queueId,
      tokenId: input.tokenId ?? null,
      eventType: input.eventType,
      metadata: input.metadata,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
}
