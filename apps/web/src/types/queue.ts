export type QueueStatus = "ACTIVE" | "INACTIVE";

export interface Queue {
  id: string;
  name: string;
  code: string;
  status: QueueStatus;
  createdAt: string;
  updatedAt: string;
  waitingCount: number;
}

export interface QueueApiResponse<T> {
  success: true;
  data: T;
}

export interface CreateQueueInput {
  name: string;
}

export interface UpdateQueueInput {
  name: string;
}

export interface UpdateQueueStatusInput {
  status: QueueStatus;
}
