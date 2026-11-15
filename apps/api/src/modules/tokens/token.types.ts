import type { TokenStatus } from "@prisma/client";
import type { QueueResponse } from "../queues/queue.types.js";

/** The token columns that may leave the API, including the queue prefix. */
export const publicTokenSelect = {
  id: true,
  tokenNumber: true,
  participantName: true,
  contactNumber: true,
  notes: true,
  status: true,
  position: true,
  queueId: true,
  createdAt: true,
  updatedAt: true,
  serviceStartedAt: true,
  serviceCompletedAt: true,
  cancelledAt: true,
  queue: {
    select: {
      code: true,
    },
  },
} as const;

export interface PublicToken {
  id: string;
  tokenNumber: number;
  participantName: string;
  contactNumber: string | null;
  notes: string | null;
  status: TokenStatus;
  position: number | null;
  queueId: string;
  createdAt: Date;
  updatedAt: Date;
  serviceStartedAt: Date | null;
  serviceCompletedAt: Date | null;
  cancelledAt: Date | null;
  queue: {
    code: string;
  };
}

export interface TokenResponse {
  id: string;
  tokenNumber: number;
  /** Human-readable token, e.g. Q7F2-001. The prefix identifies the queue. */
  displayToken: string;
  participantName: string;
  contactNumber: string | null;
  notes: string | null;
  status: TokenStatus;
  position: number | null;
  queueId: string;
  createdAt: Date;
  updatedAt: Date;
  serviceStartedAt: Date | null;
  serviceCompletedAt: Date | null;
  cancelledAt: Date | null;
  /** Seconds between registration and service start, once service has begun. */
  waitingTimeSeconds: number | null;
  /** Seconds between service start and completion, once service has finished. */
  serviceDurationSeconds: number | null;
}

export interface QueueTokenStats {
  totalGenerated: number;
  waitingCount: number;
  inServiceCount: number;
  completedCount: number;
  cancelledCount: number;
  /** Number of participants currently in the line (equal to waitingCount). */
  currentQueueLength: number;
  earliestRegistrationAt: Date | null;
}

export interface QueueTokensResponse {
  queue: QueueResponse;
  currentlyServing: TokenResponse | null;
  waiting: TokenResponse[];
  waitingCount: number;
  stats: QueueTokenStats;
  /** Tokens matching the optional status filter. Defaults to every status. */
  tokens: TokenResponse[];
}

export interface ReorderTokenResponse {
  token: TokenResponse;
  waiting: TokenResponse[];
}

export interface CancelTokenResponse {
  token: TokenResponse;
  waiting: TokenResponse[];
  waitingCount: number;
  stats: QueueTokenStats;
}

export interface QueueHistoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface QueueHistoryResponse {
  queue: QueueResponse;
  /** Completed and cancelled records, newest first. */
  items: TokenResponse[];
  pagination: QueueHistoryPagination;
}

export function formatDisplayToken(code: string, tokenNumber: number): string {
  return `${code}-${String(tokenNumber).padStart(3, "0")}`;
}

/** Whole seconds between two persisted timestamps, or null if either is missing. */
export function secondsBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) {
    return null;
  }

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export function toTokenResponse(token: PublicToken): TokenResponse {
  return {
    id: token.id,
    tokenNumber: token.tokenNumber,
    displayToken: formatDisplayToken(token.queue.code, token.tokenNumber),
    participantName: token.participantName,
    contactNumber: token.contactNumber,
    notes: token.notes,
    status: token.status,
    position: token.position,
    queueId: token.queueId,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    serviceStartedAt: token.serviceStartedAt,
    serviceCompletedAt: token.serviceCompletedAt,
    cancelledAt: token.cancelledAt,
    waitingTimeSeconds: secondsBetween(token.createdAt, token.serviceStartedAt),
    serviceDurationSeconds: secondsBetween(token.serviceStartedAt, token.serviceCompletedAt),
  };
}
