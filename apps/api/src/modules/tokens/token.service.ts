import { Prisma, type QueueStatus, type TokenStatus } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { publicQueueSelect, toQueueResponse } from "../queues/queue.types.js";
import type { CreateTokenInput, QueueTokenQuery } from "./token.schemas.js";
import {
  publicTokenSelect,
  toTokenResponse,
  type CancelTokenResponse,
  type QueueTokenStats,
  type QueueTokensResponse,
  type ReorderTokenResponse,
  type TokenResponse,
} from "./token.types.js";

type TokenClient = Pick<typeof prisma, "token">;
type TokenStatusFilter = NonNullable<QueueTokenQuery["status"]>;

interface LockedQueueRow {
  id: string;
  name: string;
  code: string;
  status: QueueStatus;
  managerId: string;
}

function queueNotFound(): AppError {
  return new AppError(404, "QUEUE_NOT_FOUND", "Queue not found.");
}

function tokenNotFound(): AppError {
  return new AppError(404, "TOKEN_NOT_FOUND", "Token not found.");
}

function tokenNotWaiting(status: TokenStatus): AppError {
  const message =
    status === "CANCELLED"
      ? "This token has already been cancelled."
      : status === "COMPLETED"
        ? "This token has already been completed."
        : "Only waiting tokens can be changed.";

  return new AppError(409, "TOKEN_NOT_WAITING", message);
}

function reorderBoundary(direction: "UP" | "DOWN"): AppError {
  return new AppError(
    409,
    "TOKEN_REORDER_BOUNDARY",
    direction === "UP"
      ? "This token is already first in the waiting list."
      : "This token is already last in the waiting list.",
  );
}

/**
 * Serialises every mutation in a queue by taking a row-level lock on the queue.
 * Registration, reordering and cancellation all acquire this lock first, which
 * makes token numbering and position assignment safe under concurrency.
 */
async function lockOwnedQueue(
  tx: Prisma.TransactionClient,
  managerId: string,
  queueId: string,
): Promise<LockedQueueRow> {
  const rows = await tx.$queryRaw<LockedQueueRow[]>`
    SELECT
      id,
      name,
      code,
      status,
      manager_id AS "managerId"
    FROM queues
    WHERE id = ${queueId}::uuid AND manager_id = ${managerId}::uuid
    FOR UPDATE
  `;

  const queue = rows[0];

  if (!queue) {
    throw queueNotFound();
  }

  return queue;
}

/** Finds a token's queue without locking, so the queue can be locked first. */
async function findOwnedTokenQueueId(
  tx: Prisma.TransactionClient,
  managerId: string,
  tokenId: string,
): Promise<string> {
  const token = await tx.token.findFirst({
    where: {
      id: tokenId,
      queue: { managerId },
    },
    select: { queueId: true },
  });

  if (!token) {
    throw tokenNotFound();
  }

  return token.queueId;
}

async function computeStats(client: TokenClient, queueId: string): Promise<QueueTokenStats> {
  const [groups, aggregate] = await Promise.all([
    client.token.groupBy({
      by: ["status"],
      where: { queueId },
      _count: { _all: true },
    }),
    client.token.aggregate({
      where: { queueId },
      _min: { createdAt: true },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<TokenStatus, number>();
  for (const group of groups) {
    counts.set(group.status, group._count._all);
  }

  const waitingCount = counts.get("WAITING") ?? 0;

  return {
    totalGenerated: aggregate._count._all,
    waitingCount,
    inServiceCount: counts.get("IN_SERVICE") ?? 0,
    completedCount: counts.get("COMPLETED") ?? 0,
    cancelledCount: counts.get("CANCELLED") ?? 0,
    currentQueueLength: waitingCount,
    earliestRegistrationAt: aggregate._min.createdAt,
  };
}

async function listWaitingTokens(client: TokenClient, queueId: string): Promise<TokenResponse[]> {
  const tokens = await client.token.findMany({
    where: { queueId, status: "WAITING" },
    select: publicTokenSelect,
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });

  return tokens.map(toTokenResponse);
}

/** Creates a participant token on an active, manager-owned queue. */
export async function registerToken(
  managerId: string,
  queueId: string,
  input: CreateTokenInput,
): Promise<TokenResponse> {
  return prisma.$transaction(async (tx) => {
    const queue = await lockOwnedQueue(tx, managerId, queueId);

    if (queue.status !== "ACTIVE") {
      throw new AppError(
        409,
        "QUEUE_INACTIVE",
        "This queue is inactive. Activate it before adding participants.",
      );
    }

    // The queue row lock held above makes this increment safe: concurrent
    // registrations wait for the previous transaction to commit.
    const counter = await tx.queue.update({
      where: { id: queue.id },
      data: { nextTokenNumber: { increment: 1 } },
      select: { nextTokenNumber: true },
    });

    const tokenNumber = counter.nextTokenNumber - 1;

    const positionAggregate = await tx.token.aggregate({
      where: { queueId: queue.id, status: "WAITING" },
      _max: { position: true },
    });

    const position = (positionAggregate._max.position ?? 0) + 1;

    const token = await tx.token.create({
      data: {
        queueId: queue.id,
        tokenNumber,
        position,
        participantName: input.participantName,
        contactNumber: input.contactNumber ?? null,
        notes: input.notes ?? null,
      },
      select: publicTokenSelect,
    });

    return toTokenResponse(token);
  });
}

/** Returns the currently serving token, the ordered waiting list, and statistics. */
export async function listQueueTokens(
  managerId: string,
  queueId: string,
  statusFilter: TokenStatusFilter = "ALL",
): Promise<QueueTokensResponse> {
  const queue = await prisma.queue.findFirst({
    where: { id: queueId, managerId },
    select: publicQueueSelect,
  });

  if (!queue) {
    throw queueNotFound();
  }

  const filteredStatus = statusFilter === "ALL" ? undefined : statusFilter;

  const [currentlyServing, waiting, filteredTokens, stats] = await Promise.all([
    prisma.token.findFirst({
      where: { queueId, status: "IN_SERVICE" },
      select: publicTokenSelect,
      orderBy: [{ serviceStartedAt: "desc" }, { createdAt: "desc" }],
    }),
    listWaitingTokens(prisma, queueId),
    prisma.token.findMany({
      where: filteredStatus ? { queueId, status: filteredStatus } : { queueId },
      select: publicTokenSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    computeStats(prisma, queueId),
  ]);

  return {
    queue: toQueueResponse(queue),
    currentlyServing: currentlyServing ? toTokenResponse(currentlyServing) : null,
    waiting,
    waitingCount: waiting.length,
    stats,
    tokens: filteredTokens.map(toTokenResponse),
  };
}

export async function getToken(managerId: string, tokenId: string): Promise<TokenResponse> {
  const token = await prisma.token.findFirst({
    where: {
      id: tokenId,
      queue: { managerId },
    },
    select: publicTokenSelect,
  });

  if (!token) {
    throw tokenNotFound();
  }

  return toTokenResponse(token);
}

/**
 * Swaps a waiting token with its neighbour. Only WAITING tokens participate,
 * and the queue lock keeps positions unique under concurrent reorders.
 */
export async function reorderToken(
  managerId: string,
  tokenId: string,
  direction: "UP" | "DOWN",
): Promise<ReorderTokenResponse> {
  return prisma.$transaction(async (tx) => {
    const queueId = await findOwnedTokenQueueId(tx, managerId, tokenId);
    await lockOwnedQueue(tx, managerId, queueId);

    const token = await tx.token.findUnique({
      where: { id: tokenId },
      select: { id: true, queueId: true, status: true, position: true },
    });

    if (!token) {
      throw tokenNotFound();
    }

    if (token.status !== "WAITING" || token.position === null) {
      throw tokenNotWaiting(token.status);
    }

    const neighbour = await tx.token.findFirst({
      where: {
        queueId: token.queueId,
        status: "WAITING",
        position: direction === "UP" ? { lt: token.position } : { gt: token.position },
      },
      select: { id: true, position: true },
      orderBy: { position: direction === "UP" ? "desc" : "asc" },
    });

    if (!neighbour || neighbour.position === null) {
      throw reorderBoundary(direction);
    }

    // Null is permitted and not compared by the unique (queue, position) index,
    // so the swap can happen without a temporary negative position.
    await tx.token.update({ where: { id: token.id }, data: { position: null } });
    await tx.token.update({
      where: { id: neighbour.id },
      data: { position: token.position },
    });
    await tx.token.update({
      where: { id: token.id },
      data: { position: neighbour.position },
    });

    const updated = await tx.token.findUnique({
      where: { id: token.id },
      select: publicTokenSelect,
    });

    if (!updated) {
      throw tokenNotFound();
    }

    return {
      token: toTokenResponse(updated),
      waiting: await listWaitingTokens(tx, token.queueId),
    };
  });
}

/** Cancels a waiting token, preserves the record, and closes the position gap. */
export async function cancelToken(
  managerId: string,
  tokenId: string,
): Promise<CancelTokenResponse> {
  return prisma.$transaction(async (tx) => {
    const queueId = await findOwnedTokenQueueId(tx, managerId, tokenId);
    await lockOwnedQueue(tx, managerId, queueId);

    const token = await tx.token.findUnique({
      where: { id: tokenId },
      select: { id: true, queueId: true, status: true, position: true },
    });

    if (!token) {
      throw tokenNotFound();
    }

    if (token.status !== "WAITING" || token.position === null) {
      throw tokenNotWaiting(token.status);
    }

    const cancelled = await tx.token.update({
      where: { id: token.id },
      data: {
        status: "CANCELLED",
        position: null,
        cancelledAt: new Date(),
      },
      select: publicTokenSelect,
    });

    // Renumber the remaining line from 1..n. Updating in ascending order never
    // collides with the unique (queue, position) index because each target
    // position was just vacated.
    const remaining = await tx.token.findMany({
      where: { queueId: token.queueId, status: "WAITING" },
      select: { id: true, position: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });

    let targetPosition = 1;

    for (const current of remaining) {
      if (current.position !== targetPosition) {
        await tx.token.update({
          where: { id: current.id },
          data: { position: targetPosition },
        });
      }

      targetPosition += 1;
    }

    const waiting = await listWaitingTokens(tx, token.queueId);

    return {
      token: toTokenResponse(cancelled),
      waiting,
      waitingCount: waiting.length,
      stats: await computeStats(tx, token.queueId),
    };
  });
}
