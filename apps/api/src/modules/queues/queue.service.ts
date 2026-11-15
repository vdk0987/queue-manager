import { randomInt } from "node:crypto";
import { Prisma, type QueueStatus } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { QUEUE_EVENT, recordQueueActivity } from "../analytics/queue-activity.service.js";
import type {
  CreateQueueInput,
  UpdateQueueInput,
  UpdateQueueStatusInput,
} from "./queue.schemas.js";
import { publicQueueSelect, toQueueResponse, type QueueResponse } from "./queue.types.js";

/**
 * Unambiguous alphabet for short queue codes: no 0/O or 1/I confusion when a
 * manager reads a token aloud or writes it on a ticket.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;
const CODE_ATTEMPTS = 6;

function queueNotFound(): AppError {
  return new AppError(404, "QUEUE_NOT_FOUND", "Queue not found.");
}

function generateQueueCode(): string {
  let suffix = "";

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }

  return `Q${suffix}`;
}

function isQueueCodeCollision(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createQueue(
  managerId: string,
  input: CreateQueueInput,
): Promise<QueueResponse> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      const queue = await prisma.queue.create({
        data: {
          managerId,
          name: input.name,
          code: generateQueueCode(),
        },
        select: publicQueueSelect,
      });

      return toQueueResponse(queue);
    } catch (error) {
      if (isQueueCodeCollision(error) && attempt < CODE_ATTEMPTS - 1) {
        continue;
      }

      throw error;
    }
  }

  // Unreachable: the loop either returns a queue or rethrows. Keeps TypeScript
  // satisfied without weakening the return type.
  throw new AppError(500, "INTERNAL_ERROR", "Could not generate a queue code.");
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
  return prisma.$transaction(async (tx) => {
    // Lock first so a concurrent Next Token cannot start a service while the
    // queue is being deactivated, and so repeated clicks become no-ops.
    const rows = await tx.$queryRaw<Array<{ id: string; status: QueueStatus }>>`
      SELECT id, status
      FROM queues
      WHERE id = ${queueId}::uuid AND manager_id = ${managerId}::uuid
      FOR UPDATE
    `;

    const existing = rows[0];

    if (!existing) {
      throw queueNotFound();
    }

    if (existing.status === input.status) {
      const unchanged = await tx.queue.findUnique({
        where: { id: queueId },
        select: publicQueueSelect,
      });

      if (!unchanged) {
        throw queueNotFound();
      }

      return toQueueResponse(unchanged);
    }

    if (input.status === "INACTIVE") {
      // A participant currently being served must not be stranded by deactivation.
      // Waiting tokens are preserved and simply resume when the queue is activated.
      const inServiceCount = await tx.token.count({
        where: { queueId, status: "IN_SERVICE" },
      });

      if (inServiceCount > 0) {
        throw new AppError(
          409,
          "QUEUE_IN_SERVICE",
          "Finish or cancel the token currently in service before deactivating this queue.",
        );
      }
    }

    const updated = await tx.queue.update({
      where: { id: queueId },
      data: { status: input.status },
      select: publicQueueSelect,
    });

    await recordQueueActivity(tx, {
      queueId,
      eventType:
        input.status === "ACTIVE" ? QUEUE_EVENT.QUEUE_ACTIVATED : QUEUE_EVENT.QUEUE_DEACTIVATED,
    });

    return toQueueResponse(updated);
  });
}
