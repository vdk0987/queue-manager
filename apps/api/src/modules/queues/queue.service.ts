import type { Prisma } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type {
  CreateQueueInput,
  UpdateQueueInput,
  UpdateQueueStatusInput,
} from "./queue.schemas.js";
import { publicQueueSelect, toQueueResponse, type QueueResponse } from "./queue.types.js";

function queueNotFound(): AppError {
  return new AppError(404, "QUEUE_NOT_FOUND", "Queue not found.");
}

export async function createQueue(
  managerId: string,
  input: CreateQueueInput,
): Promise<QueueResponse> {
  const queue = await prisma.queue.create({
    data: {
      managerId,
      name: input.name,
    },
    select: publicQueueSelect,
  });

  return toQueueResponse(queue);
}

export async function listQueues(managerId: string): Promise<QueueResponse[]> {
  const queues = await prisma.queue.findMany({
    where: { managerId },
    select: publicQueueSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return queues.map(toQueueResponse);
}

export async function getQueue(managerId: string, queueId: string): Promise<QueueResponse> {
  const queue = await prisma.queue.findFirst({
    where: { id: queueId, managerId },
    select: publicQueueSelect,
  });

  if (!queue) {
    throw queueNotFound();
  }

  return toQueueResponse(queue);
}

/**
 * Updates are scoped by both queue id and manager id, so a manager can never
 * modify another manager's queue even if they know its UUID.
 */
async function updateOwnedQueue(
  managerId: string,
  queueId: string,
  data: Prisma.QueueUpdateManyMutationInput,
): Promise<QueueResponse> {
  const result = await prisma.queue.updateMany({
    where: { id: queueId, managerId },
    data,
  });

  if (result.count === 0) {
    throw queueNotFound();
  }

  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    select: publicQueueSelect,
  });

  if (!queue) {
    throw queueNotFound();
  }

  return toQueueResponse(queue);
}

export async function renameQueue(
  managerId: string,
  queueId: string,
  input: UpdateQueueInput,
): Promise<QueueResponse> {
  return updateOwnedQueue(managerId, queueId, { name: input.name });
}

export async function setQueueStatus(
  managerId: string,
  queueId: string,
  input: UpdateQueueStatusInput,
): Promise<QueueResponse> {
  // Phase 3 adds the first tokens. Once they exist, deactivation must be
  // rejected while a token is IN_SERVICE, and existing waiting tokens must be
  // preserved rather than deleted.
  return updateOwnedQueue(managerId, queueId, { status: input.status });
}
