import type { Queue, QueueApiResponse } from "@/types/queue";

export type TokenStatus = "WAITING" | "IN_SERVICE" | "COMPLETED" | "CANCELLED";

export type TokenFilterStatus = TokenStatus | "ALL";

export interface Token {
  id: string;
  tokenNumber: number;
  displayToken: string;
  participantName: string;
  contactNumber: string | null;
  notes: string | null;
  status: TokenStatus;
  position: number | null;
  queueId: string;
  createdAt: string;
  updatedAt: string;
  serviceStartedAt: string | null;
  serviceCompletedAt: string | null;
  cancelledAt: string | null;
  /** Seconds from registration to service start, once service has begun. */
  waitingTimeSeconds: number | null;
  /** Seconds from service start to completion, once service has finished. */
  serviceDurationSeconds: number | null;
}

export interface QueueTokenStats {
  totalGenerated: number;
  waitingCount: number;
  inServiceCount: number;
  completedCount: number;
  cancelledCount: number;
  currentQueueLength: number;
  earliestRegistrationAt: string | null;
}

export interface QueueTokensData {
  queue: Queue;
  currentlyServing: Token | null;
  waiting: Token[];
  waitingCount: number;
  stats: QueueTokenStats;
  tokens: Token[];
}

export interface RegisterParticipantInput {
  participantName: string;
  contactNumber?: string;
  notes?: string;
}

export interface ReorderTokenInput {
  direction: "UP" | "DOWN";
}

export interface ReorderTokenData {
  token: Token;
  waiting: Token[];
}

export interface CancelTokenData {
  token: Token;
  waiting: Token[];
  waitingCount: number;
  stats: QueueTokenStats;
}

export type HistoryStatusFilter = "ALL" | "COMPLETED" | "CANCELLED";

export interface QueueHistoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface QueueHistoryData {
  queue: Queue;
  items: Token[];
  pagination: QueueHistoryPagination;
}

export type TokenApiResponse<T> = QueueApiResponse<T>;
