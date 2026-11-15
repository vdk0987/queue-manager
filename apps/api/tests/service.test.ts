import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

const ACCOUNT_A = {
  name: "Ada Lovelace",
  email: "ada@queuepilot.test",
  password: "Analytical1",
};

const ACCOUNT_B = {
  name: "Grace Hopper",
  email: "grace@queuepilot.test",
  password: "Compilers1",
};

type Agent = ReturnType<typeof request.agent>;

interface TokenBody {
  id: string;
  tokenNumber: number;
  displayToken: string;
  participantName: string;
  status: string;
  position: number | null;
  queueId: string;
  createdAt: string;
  serviceStartedAt: string | null;
  serviceCompletedAt: string | null;
  cancelledAt: string | null;
  waitingTimeSeconds: number | null;
  serviceDurationSeconds: number | null;
}

async function registerManager(account: typeof ACCOUNT_A): Promise<{ agent: Agent; id: string }> {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/register").send(account);

  if (response.status !== 201) {
    throw new Error(`Failed to register test manager: ${JSON.stringify(response.body)}`);
  }

  return { agent, id: response.body.manager.id as string };
}

async function createQueue(agent: Agent, name: string): Promise<string> {
  const response = await agent.post("/api/queues").send({ name });

  if (response.status !== 201) {
    throw new Error(`Failed to create test queue: ${JSON.stringify(response.body)}`);
  }

  return response.body.data.id as string;
}

async function registerParticipant(
  agent: Agent,
  queueId: string,
  participantName = "John Doe",
): Promise<TokenBody> {
  const response = await agent
    .post(`/api/queues/${queueId}/tokens`)
    .send({ participantName, contactNumber: "9876543210" });

  if (response.status !== 201) {
    throw new Error(`Failed to register participant: ${JSON.stringify(response.body)}`);
  }

  return response.body.data as TokenBody;
}

async function assignNext(agent: Agent, queueId: string) {
  return agent.post(`/api/queues/${queueId}/next`);
}

async function complete(agent: Agent, tokenId: string) {
  return agent.post(`/api/tokens/${tokenId}/complete`);
}

describe("service authentication", () => {
  it("requires a session for every service endpoint", async () => {
    const queueId = randomUUID();
    const tokenId = randomUUID();

    const next = await request(app).post(`/api/queues/${queueId}/next`);
    const current = await request(app).get(`/api/queues/${queueId}/current`);
    const history = await request(app).get(`/api/queues/${queueId}/history`);
    const completeService = await request(app).post(`/api/tokens/${tokenId}/complete`);

    for (const response of [next, current, history, completeService]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("POST /api/queues/:id/next", () => {
  it("assigns the first waiting token and normalises the remaining line", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "General Consultation");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");
    const third = await registerParticipant(agent, queueId, "David");

    const response = await assignNext(agent, queueId);

    expect(response.status).toBe(200);
    expect(response.header["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: first.id,
        tokenNumber: 1,
        displayToken: first.displayToken,
        participantName: "John",
        status: "IN_SERVICE",
        position: null,
      },
    });
    expect(response.body.data.serviceStartedAt).toEqual(expect.any(String));
    expect(response.body.data.serviceCompletedAt).toBeNull();
    expect(response.body.data.serviceDurationSeconds).toBeNull();
    expect(response.body.data).not.toHaveProperty("queue");

    const saved = await prisma.token.findUnique({ where: { id: first.id } });
    expect(saved?.status).toBe("IN_SERVICE");
    expect(saved?.position).toBeNull();
    expect(saved?.serviceStartedAt).not.toBeNull();

    const workspace = await agent.get(`/api/queues/${queueId}/tokens`);
    expect(workspace.body.data.currentlyServing.id).toBe(first.id);
    expect(workspace.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([
      second.id,
      third.id,
    ]);
    expect(workspace.body.data.waiting.map((token: TokenBody) => token.position)).toEqual([1, 2]);
    expect(workspace.body.data.stats).toMatchObject({
      totalGenerated: 3,
      waitingCount: 2,
      inServiceCount: 1,
      completedCount: 0,
    });
  });

  it("rejects assignment when the queue is empty", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Empty queue");

    const response = await assignNext(agent, queueId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("QUEUE_EMPTY");
    expect(await prisma.token.count({ where: { queueId, status: "IN_SERVICE" } })).toBe(0);
  });

  it("rejects assignment while another token is in service", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Busy queue");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");

    const assigned = await assignNext(agent, queueId);
    const rejected = await assignNext(agent, queueId);

    expect(assigned.status).toBe(200);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe("QUEUE_IN_SERVICE");

    const saved = await prisma.token.findMany({ where: { queueId, status: "IN_SERVICE" } });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe(first.id);

    const waiting = await prisma.token.findMany({ where: { queueId, status: "WAITING" } });
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.id).toBe(second.id);
    expect(waiting[0]?.position).toBe(1);
  });

  it("rejects assignment on an inactive queue", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Paused queue");
    await registerParticipant(agent, queueId);
    await agent.patch(`/api/queues/${queueId}/status`).send({ status: "INACTIVE" });

    const response = await assignNext(agent, queueId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("QUEUE_INACTIVE");
    expect(await prisma.token.count({ where: { queueId, status: "IN_SERVICE" } })).toBe(0);
  });

  it("assigns the next waiting token after the previous service completes", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");

    await assignNext(agent, queueId);
    await complete(agent, first.id);
    const next = await assignNext(agent, queueId);

    expect(next.status).toBe(200);
    expect(next.body.data.id).toBe(second.id);
    expect(next.body.data.status).toBe("IN_SERVICE");
    expect(next.body.data.position).toBeNull();
  });

  it("hides another manager's queue behind a 404", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");
    await registerParticipant(alice.agent, queueId);

    const response = await assignNext(bob.agent, queueId);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");
    expect(await prisma.token.count({ where: { queueId, status: "IN_SERVICE" } })).toBe(0);
  });

  it("assigns only one token under concurrent Next Token requests", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Burst queue");
    const tokens: TokenBody[] = [];

    // Register sequentially so the expected service order is deterministic.
    for (const name of ["John", "Alice", "David", "Maya", "Noah"]) {
      tokens.push(await registerParticipant(agent, queueId, name));
    }

    const responses = await Promise.all(tokens.map(() => assignNext(agent, queueId)));
    const assigned = responses.filter((response) => response.status === 200);
    const rejected = responses.filter((response) => response.status === 409);

    expect(assigned).toHaveLength(1);
    expect(rejected).toHaveLength(tokens.length - 1);

    for (const response of rejected) {
      expect(response.body.error.code).toBe("QUEUE_IN_SERVICE");
    }

    expect(assigned[0]?.body.data.id).toBe(tokens[0]?.id);

    const inService = await prisma.token.findMany({ where: { queueId, status: "IN_SERVICE" } });
    expect(inService).toHaveLength(1);
    expect(inService[0]?.id).toBe(tokens[0]?.id);

    const workspace = await agent.get(`/api/queues/${queueId}/tokens`);
    const waiting = workspace.body.data.waiting as TokenBody[];
    expect(waiting.map((token) => token.position)).toEqual([1, 2, 3, 4]);
    expect(waiting.map((token) => token.id)).toEqual(tokens.slice(1).map((token) => token.id));
  });
});

describe("GET /api/queues/:id/current", () => {
  it("returns null when no token is being served", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    await registerParticipant(agent, queueId);

    const response = await agent.get(`/api/queues/${queueId}/current`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: null });
  });

  it("returns the active token after assignment and keeps it visible on refresh", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const token = await registerParticipant(agent, queueId);

    const assigned = await assignNext(agent, queueId);
    const current = await agent.get(`/api/queues/${queueId}/current`);

    expect(current.status).toBe(200);
    expect(current.body.data).toMatchObject({
      id: token.id,
      participantName: "John Doe",
      status: "IN_SERVICE",
      serviceStartedAt: assigned.body.data.serviceStartedAt,
      serviceCompletedAt: null,
    });
    expect(current.body.data.serviceDurationSeconds).toBeNull();
  });

  it("calculates waiting time from registration to service start", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const token = await registerParticipant(agent, queueId);

    const createdAt = new Date("2026-01-01T09:00:00.000Z");
    const serviceStartedAt = new Date("2026-01-01T09:05:30.000Z");
    await prisma.token.update({
      where: { id: token.id },
      data: { status: "IN_SERVICE", position: null, createdAt, serviceStartedAt },
    });

    const current = await agent.get(`/api/queues/${queueId}/current`);

    expect(current.body.data.waitingTimeSeconds).toBe(330);
    expect(current.body.data.serviceStartedAt).toBe(serviceStartedAt.toISOString());
  });

  it("hides another manager's queue behind a 404", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");

    const response = await bob.agent.get(`/api/queues/${queueId}/current`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");
  });
});

describe("POST /api/tokens/:id/complete", () => {
  it("completes the active service and records the duration", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");

    await assignNext(agent, queueId);
    const startedAt = new Date(Date.now() - 8 * 60 * 1000);
    await prisma.token.update({
      where: { id: first.id },
      data: { serviceStartedAt: startedAt },
    });

    const response = await complete(agent, first.id);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Service completed successfully");
    expect(response.body.data).toMatchObject({
      id: first.id,
      status: "COMPLETED",
      serviceDurationSeconds: 480,
    });
    expect(response.body.data.serviceStartedAt).toBe(startedAt.toISOString());
    expect(response.body.data.serviceCompletedAt).toEqual(expect.any(String));

    const saved = await prisma.token.findUnique({ where: { id: first.id } });
    expect(saved?.status).toBe("COMPLETED");
    expect(saved?.serviceStartedAt?.toISOString()).toBe(startedAt.toISOString());
    expect(saved?.serviceCompletedAt).not.toBeNull();

    const current = await agent.get(`/api/queues/${queueId}/current`);
    expect(current.body.data).toBeNull();

    const workspace = await agent.get(`/api/queues/${queueId}/tokens`);
    expect(workspace.body.data.stats).toMatchObject({
      totalGenerated: 2,
      waitingCount: 1,
      inServiceCount: 0,
      completedCount: 1,
    });
    expect(workspace.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([second.id]);
    expect(workspace.body.data.waiting[0].position).toBe(1);
  });

  it("rejects completing a waiting token", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const token = await registerParticipant(agent, queueId);

    const response = await complete(agent, token.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TOKEN_NOT_IN_SERVICE");
    expect(response.body.error.message).toMatch(/not currently being served/i);

    const saved = await prisma.token.findUnique({ where: { id: token.id } });
    expect(saved?.status).toBe("WAITING");
    expect(saved?.serviceCompletedAt).toBeNull();
  });

  it("rejects completing the same token twice", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const token = await registerParticipant(agent, queueId);

    await assignNext(agent, queueId);
    const first = await complete(agent, token.id);
    const second = await complete(agent, token.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("TOKEN_NOT_IN_SERVICE");
    expect(second.body.error.message).toMatch(/already been completed/i);

    const saved = await prisma.token.findUnique({ where: { id: token.id } });
    expect(saved?.status).toBe("COMPLETED");
    expect(saved?.serviceCompletedAt?.toISOString()).toBe(
      new Date(first.body.data.serviceCompletedAt).toISOString(),
    );
  });

  it("rejects completing a cancelled token", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const token = await registerParticipant(agent, queueId);

    await agent.post(`/api/tokens/${token.id}/cancel`);
    const response = await complete(agent, token.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TOKEN_NOT_IN_SERVICE");
    expect(response.body.error.message).toMatch(/cancelled/i);

    const saved = await prisma.token.findUnique({ where: { id: token.id } });
    expect(saved?.status).toBe("CANCELLED");
    expect(saved?.serviceCompletedAt).toBeNull();
  });

  it("hides another manager's token behind a 404", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");
    const token = await registerParticipant(alice.agent, queueId);

    await assignNext(alice.agent, queueId);
    const response = await complete(bob.agent, token.id);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("TOKEN_NOT_FOUND");

    const saved = await prisma.token.findUnique({ where: { id: token.id } });
    expect(saved?.status).toBe("IN_SERVICE");
  });
});

describe("GET /api/queues/:id/history", () => {
  async function buildHistory(agent: Agent, queueId: string) {
    const completedOne = await registerParticipant(agent, queueId, "John");
    await assignNext(agent, queueId);
    await complete(agent, completedOne.id);

    const completedTwo = await registerParticipant(agent, queueId, "Alice");
    await assignNext(agent, queueId);
    await complete(agent, completedTwo.id);

    const cancelled = await registerParticipant(agent, queueId, "David");
    await agent.post(`/api/tokens/${cancelled.id}/cancel`);

    const waiting = await registerParticipant(agent, queueId, "Maya");

    return { completedOne, completedTwo, cancelled, waiting };
  }

  it("returns completed and cancelled tokens without waiting tokens", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const { completedOne, completedTwo, cancelled } = await buildHistory(agent, queueId);

    const response = await agent.get(`/api/queues/${queueId}/history`);

    expect(response.status).toBe(200);
    expect(response.body.data.queue).toMatchObject({ id: queueId, name: "Support" });
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    const ids = response.body.data.items.map((token: TokenBody) => token.id);
    expect(ids).toEqual(expect.arrayContaining([completedOne.id, completedTwo.id, cancelled.id]));
    expect(ids).not.toContain(undefined);

    const completedItems = response.body.data.items.filter(
      (token: TokenBody) => token.status === "COMPLETED",
    );
    for (const token of completedItems) {
      expect(token.serviceStartedAt).toEqual(expect.any(String));
      expect(token.serviceCompletedAt).toEqual(expect.any(String));
      expect(token.serviceDurationSeconds).toEqual(expect.any(Number));
      expect(token.waitingTimeSeconds).toEqual(expect.any(Number));
    }

    const cancelledItem = response.body.data.items.find(
      (token: TokenBody) => token.id === cancelled.id,
    );
    expect(cancelledItem?.status).toBe("CANCELLED");
    expect(cancelledItem?.cancelledAt).toEqual(expect.any(String));
    expect(cancelledItem?.serviceCompletedAt).toBeNull();
    expect(cancelledItem?.serviceDurationSeconds).toBeNull();
  });

  it("sorts by completion time, newest first", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const { completedOne, completedTwo, cancelled } = await buildHistory(agent, queueId);

    await prisma.token.update({
      where: { id: completedOne.id },
      data: { serviceCompletedAt: new Date("2026-01-01T10:00:00.000Z") },
    });
    await prisma.token.update({
      where: { id: completedTwo.id },
      data: { serviceCompletedAt: new Date("2026-01-01T12:00:00.000Z") },
    });
    await prisma.token.update({
      where: { id: cancelled.id },
      data: { cancelledAt: new Date("2026-01-01T11:00:00.000Z") },
    });

    const response = await agent.get(`/api/queues/${queueId}/history`);
    const ids = response.body.data.items.map((token: TokenBody) => token.id);

    expect(ids).toEqual([completedTwo.id, cancelled.id, completedOne.id]);
  });

  it("filters by status and date range", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const { completedOne, completedTwo, cancelled } = await buildHistory(agent, queueId);

    await prisma.token.update({
      where: { id: completedOne.id },
      data: { serviceCompletedAt: new Date("2026-02-01T10:00:00.000Z") },
    });
    await prisma.token.update({
      where: { id: completedTwo.id },
      data: { serviceCompletedAt: new Date("2026-03-01T10:00:00.000Z") },
    });
    await prisma.token.update({
      where: { id: cancelled.id },
      data: { cancelledAt: new Date("2026-02-15T10:00:00.000Z") },
    });

    const completed = await agent.get(`/api/queues/${queueId}/history?status=COMPLETED`);
    const cancelledOnly = await agent.get(`/api/queues/${queueId}/history?status=CANCELLED`);
    const ranged = await agent.get(
      `/api/queues/${queueId}/history?startDate=2026-02-01T00:00:00.000Z&endDate=2026-02-28T23:59:59.000Z`,
    );

    expect(completed.body.data.items).toHaveLength(2);
    expect(
      completed.body.data.items.every((token: TokenBody) => token.status === "COMPLETED"),
    ).toBe(true);
    expect(cancelledOnly.body.data.items).toHaveLength(1);
    expect(cancelledOnly.body.data.items[0]?.id).toBe(cancelled.id);

    expect(ranged.body.data.items.map((token: TokenBody) => token.id)).toEqual([
      cancelled.id,
      completedOne.id,
    ]);
  });

  it("paginates results", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    await buildHistory(agent, queueId);

    const first = await agent.get(`/api/queues/${queueId}/history?page=1&limit=1`);
    const second = await agent.get(`/api/queues/${queueId}/history?page=2&limit=1`);
    const last = await agent.get(`/api/queues/${queueId}/history?page=3&limit=1`);

    expect(first.body.data.items).toHaveLength(1);
    expect(first.body.data.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 3,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(second.body.data.pagination).toMatchObject({
      page: 2,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(last.body.data.pagination).toMatchObject({
      page: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(first.body.data.items[0].id).not.toBe(second.body.data.items[0].id);
  });

  it("validates history filters", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const badStatus = await agent.get(`/api/queues/${queueId}/history?status=WAITING`);
    const badDate = await agent.get(`/api/queues/${queueId}/history?startDate=not-a-date`);
    const badRange = await agent.get(
      `/api/queues/${queueId}/history?startDate=2026-03-01T00:00:00.000Z&endDate=2026-02-01T00:00:00.000Z`,
    );
    const badLimit = await agent.get(`/api/queues/${queueId}/history?limit=500`);
    const badPage = await agent.get(`/api/queues/${queueId}/history?page=0`);

    for (const response of [badStatus, badDate, badRange, badLimit, badPage]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }

    expect(badRange.body.error.details.fieldErrors.endDate).toEqual(expect.any(Array));
  });

  it("hides another manager's history behind a 404", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");
    await buildHistory(alice.agent, queueId);

    const response = await bob.agent.get(`/api/queues/${queueId}/history`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");
  });
});
