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

interface TestManager {
  id: string;
}

interface TokenBody {
  id: string;
  tokenNumber: number;
  displayToken: string;
  participantName: string;
  contactNumber: string | null;
  notes: string | null;
  status: string;
  position: number | null;
  queueId: string;
  createdAt: string;
  serviceStartedAt: string | null;
  serviceCompletedAt: string | null;
  cancelledAt: string | null;
}

async function registerManager(account: typeof ACCOUNT_A): Promise<{
  agent: ReturnType<typeof request.agent>;
  manager: TestManager;
}> {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/register").send(account);

  if (response.status !== 201) {
    throw new Error(`Failed to register test manager: ${JSON.stringify(response.body)}`);
  }

  return { agent, manager: response.body.manager as TestManager };
}

async function createQueue(agent: ReturnType<typeof request.agent>, name: string): Promise<string> {
  const response = await agent.post("/api/queues").send({ name });

  if (response.status !== 201) {
    throw new Error(`Failed to create test queue: ${JSON.stringify(response.body)}`);
  }

  return response.body.data.id as string;
}

async function registerParticipant(
  agent: ReturnType<typeof request.agent>,
  queueId: string,
  participantName = "John Doe",
): Promise<TokenBody> {
  const response = await agent
    .post(`/api/queues/${queueId}/tokens`)
    .send({ participantName, contactNumber: "9876543210", notes: "General consultation" });

  if (response.status !== 201) {
    throw new Error(`Failed to register participant: ${JSON.stringify(response.body)}`);
  }

  return response.body.data as TokenBody;
}

describe("token authentication", () => {
  it("requires a session for every token endpoint", async () => {
    const queueId = randomUUID();
    const tokenId = randomUUID();

    const register = await request(app)
      .post(`/api/queues/${queueId}/tokens`)
      .send({ participantName: "John Doe" });
    const list = await request(app).get(`/api/queues/${queueId}/tokens`);
    const details = await request(app).get(`/api/tokens/${tokenId}`);
    const reorder = await request(app)
      .patch(`/api/tokens/${tokenId}/reorder`)
      .send({ direction: "UP" });
    const cancel = await request(app).post(`/api/tokens/${tokenId}/cancel`);

    for (const response of [register, list, details, reorder, cancel]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("POST /api/queues/:id/tokens", () => {
  it("registers a participant and returns a generated token", async () => {
    const { agent, manager } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "General Consultation");

    const response = await agent.post(`/api/queues/${queueId}/tokens`).send({
      participantName: "  John   Doe  ",
      contactNumber: " 9876543210 ",
      notes: "  General consultation  ",
    });

    expect(response.status).toBe(201);
    expect(response.header["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      success: true,
      data: {
        tokenNumber: 1,
        participantName: "John Doe",
        contactNumber: "9876543210",
        notes: "General consultation",
        status: "WAITING",
        position: 1,
        queueId,
        serviceStartedAt: null,
        serviceCompletedAt: null,
        cancelledAt: null,
      },
    });
    expect(response.body.data.displayToken).toMatch(/^Q[A-HJ-NP-Z2-9]{4}-001$/);
    expect(response.body.data.id).toEqual(expect.any(String));
    expect(response.body.data.createdAt).toEqual(expect.any(String));
    expect(response.body.data).not.toHaveProperty("queue");
    expect(response.body.data).not.toHaveProperty("managerId");

    const saved = await prisma.token.findUnique({ where: { id: response.body.data.id } });
    expect(saved?.queueId).toBe(queueId);
    expect(saved?.tokenNumber).toBe(1);
    expect(saved?.position).toBe(1);

    const queue = await prisma.queue.findUnique({ where: { id: queueId } });
    expect(queue?.managerId).toBe(manager.id);
    expect(queue?.nextTokenNumber).toBe(2);
  });

  it("assigns sequential token numbers and positions", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");
    const third = await registerParticipant(agent, queueId, "David");

    expect([first.tokenNumber, second.tokenNumber, third.tokenNumber]).toEqual([1, 2, 3]);
    expect([first.position, second.position, third.position]).toEqual([1, 2, 3]);
    expect(second.displayToken.endsWith("-002")).toBe(true);
    expect(third.displayToken.endsWith("-003")).toBe(true);
  });

  it("rejects registration into an inactive queue", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Paused queue");
    await agent.patch(`/api/queues/${queueId}/status`).send({ status: "INACTIVE" });

    const response = await agent
      .post(`/api/queues/${queueId}/tokens`)
      .send({ participantName: "John Doe" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("QUEUE_INACTIVE");
    expect(await prisma.token.count({ where: { queueId } })).toBe(0);

    await agent.patch(`/api/queues/${queueId}/status`).send({ status: "ACTIVE" });
    const reactivated = await registerParticipant(agent, queueId);
    expect(reactivated.tokenNumber).toBe(1);
  });

  it("validates participant details", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const blank = await agent
      .post(`/api/queues/${queueId}/tokens`)
      .send({ participantName: "   " });
    const missing = await agent.post(`/api/queues/${queueId}/tokens`).send({});
    const tooLong = await agent
      .post(`/api/queues/${queueId}/tokens`)
      .send({ participantName: "a".repeat(101) });
    const badContact = await agent
      .post(`/api/queues/${queueId}/tokens`)
      .send({ participantName: "John", contactNumber: "call me" });
    const longNotes = await agent
      .post(`/api/queues/${queueId}/tokens`)
      .send({ participantName: "John", notes: "a".repeat(501) });

    for (const response of [blank, missing]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details.fieldErrors.participantName).toEqual(expect.any(Array));
    }

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details.fieldErrors.participantName.join(" ")).toMatch(/100/);
    expect(badContact.status).toBe(400);
    expect(badContact.body.error.details.fieldErrors.contactNumber).toEqual(expect.any(Array));
    expect(longNotes.status).toBe(400);
    expect(longNotes.body.error.details.fieldErrors.notes).toEqual(expect.any(Array));
  });

  it("accepts optional contact and notes as empty strings", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const response = await agent.post(`/api/queues/${queueId}/tokens`).send({
      participantName: "John",
      contactNumber: "",
      notes: "   ",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.contactNumber).toBeNull();
    expect(response.body.data.notes).toBeNull();
  });

  it("ignores client-supplied identity and ordering fields", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Support");

    const response = await alice.agent.post(`/api/queues/${queueId}/tokens`).send({
      participantName: "John",
      tokenNumber: 99,
      position: 50,
      status: "CANCELLED",
      queueId: randomUUID(),
      managerId: bob.manager.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      tokenNumber: 1,
      position: 1,
      status: "WAITING",
      queueId,
    });
  });

  it("hides another manager's queue behind a 404", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");

    const response = await bob.agent
      .post(`/api/queues/${queueId}/tokens`)
      .send({ participantName: "Intruder" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");
    expect(await prisma.token.count({ where: { queueId } })).toBe(0);
  });

  it("returns validation and not-found errors for bad queue IDs", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const malformed = await agent
      .post("/api/queues/not-a-uuid/tokens")
      .send({ participantName: "John" });
    const unknown = await agent
      .post(`/api/queues/${randomUUID()}/tokens`)
      .send({ participantName: "John" });

    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("QUEUE_NOT_FOUND");
  });
});

describe("GET /api/queues/:id/tokens", () => {
  it("returns the ordered waiting list, currently serving token and statistics", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "General Consultation");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");
    const third = await registerParticipant(agent, queueId, "David");

    const initial = await agent.get(`/api/queues/${queueId}/tokens`);

    expect(initial.status).toBe(200);
    expect(initial.body.data.queue).toMatchObject({
      id: queueId,
      name: "General Consultation",
      status: "ACTIVE",
      waitingCount: 3,
    });
    expect(initial.body.data.queue.code).toMatch(/^Q[A-HJ-NP-Z2-9]{4}$/);
    expect(initial.body.data.currentlyServing).toBeNull();
    expect(initial.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
    expect(initial.body.data.waiting.map((token: TokenBody) => token.position)).toEqual([1, 2, 3]);
    expect(initial.body.data.waitingCount).toBe(3);
    expect(initial.body.data.stats).toMatchObject({
      totalGenerated: 3,
      waitingCount: 3,
      inServiceCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      currentQueueLength: 3,
    });
    expect(initial.body.data.stats.earliestRegistrationAt).toEqual(expect.any(String));

    await prisma.token.update({
      where: { id: second.id },
      data: { status: "IN_SERVICE", position: null, serviceStartedAt: new Date() },
    });

    const serving = await agent.get(`/api/queues/${queueId}/tokens`);
    expect(serving.body.data.currentlyServing.id).toBe(second.id);
    expect(serving.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([
      first.id,
      third.id,
    ]);
    expect(serving.body.data.stats.inServiceCount).toBe(1);
  });

  it("filters the token list by status", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    await registerParticipant(agent, queueId, "Alice");

    await agent.post(`/api/tokens/${first.id}/cancel`);

    const cancelled = await agent.get(`/api/queues/${queueId}/tokens?status=CANCELLED`);
    const waiting = await agent.get(`/api/queues/${queueId}/tokens?status=WAITING`);
    const all = await agent.get(`/api/queues/${queueId}/tokens?status=ALL`);

    expect(cancelled.body.data.tokens).toHaveLength(1);
    expect(cancelled.body.data.tokens[0].id).toBe(first.id);
    expect(waiting.body.data.tokens).toHaveLength(1);
    expect(waiting.body.data.tokens[0].participantName).toBe("Alice");
    expect(all.body.data.tokens).toHaveLength(2);
  });

  it("rejects an unsupported status filter", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const response = await agent.get(`/api/queues/${queueId}/tokens?status=ARCHIVED`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.fieldErrors.status).toEqual(expect.any(Array));
  });

  it("hides another manager's queue and handles unknown or malformed IDs", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");

    const foreign = await bob.agent.get(`/api/queues/${queueId}/tokens`);
    const unknown = await alice.agent.get(`/api/queues/${randomUUID()}/tokens`);
    const malformed = await alice.agent.get("/api/queues/not-a-uuid/tokens");

    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("QUEUE_NOT_FOUND");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("QUEUE_NOT_FOUND");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/tokens/:id", () => {
  it("returns token details to its owner", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const token = await registerParticipant(agent, queueId, "John");

    const response = await agent.get(`/api/tokens/${token.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: token.id,
      displayToken: token.displayToken,
      participantName: "John",
      status: "WAITING",
      position: 1,
    });
  });

  it("hides another manager's token and handles unknown or malformed IDs", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");
    const token = await registerParticipant(alice.agent, queueId);

    const foreign = await bob.agent.get(`/api/tokens/${token.id}`);
    const unknown = await alice.agent.get(`/api/tokens/${randomUUID()}`);
    const malformed = await alice.agent.get("/api/tokens/not-a-uuid");

    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("TOKEN_NOT_FOUND");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("TOKEN_NOT_FOUND");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/tokens/:id/reorder", () => {
  it("moves a waiting token up without changing its token number", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");
    const third = await registerParticipant(agent, queueId, "David");

    const response = await agent.patch(`/api/tokens/${third.id}/reorder`).send({ direction: "UP" });

    expect(response.status).toBe(200);
    expect(response.body.data.token).toMatchObject({
      id: third.id,
      tokenNumber: 3,
      position: 2,
    });
    expect(response.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([
      first.id,
      third.id,
      second.id,
    ]);
    expect(response.body.data.waiting.map((token: TokenBody) => token.position)).toEqual([1, 2, 3]);

    const saved = await prisma.token.findUnique({ where: { id: third.id } });
    expect(saved?.tokenNumber).toBe(3);
    expect(saved?.position).toBe(2);
  });

  it("moves a waiting token down", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");

    const response = await agent
      .patch(`/api/tokens/${first.id}/reorder`)
      .send({ direction: "DOWN" });

    expect(response.status).toBe(200);
    expect(response.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("rejects moves beyond the boundaries of the waiting list", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");

    const moveFirstUp = await agent
      .patch(`/api/tokens/${first.id}/reorder`)
      .send({ direction: "UP" });
    const moveLastDown = await agent
      .patch(`/api/tokens/${second.id}/reorder`)
      .send({ direction: "DOWN" });

    for (const response of [moveFirstUp, moveLastDown]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("TOKEN_REORDER_BOUNDARY");
    }
  });

  it("rejects invalid directions and non-waiting tokens", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    await registerParticipant(agent, queueId, "Alice");

    const invalid = await agent
      .patch(`/api/tokens/${first.id}/reorder`)
      .send({ direction: "LEFT" });

    await agent.post(`/api/tokens/${first.id}/cancel`);
    const cancelled = await agent
      .patch(`/api/tokens/${first.id}/reorder`)
      .send({ direction: "DOWN" });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.error.code).toBe("TOKEN_NOT_WAITING");
  });

  it("hides another manager's token behind a 404", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");
    const first = await registerParticipant(alice.agent, queueId, "John");
    await registerParticipant(alice.agent, queueId, "Alice");

    const response = await bob.agent
      .patch(`/api/tokens/${first.id}/reorder`)
      .send({ direction: "DOWN" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("TOKEN_NOT_FOUND");
  });

  it("keeps positions consistent across concurrent reorders", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const tokens = await Promise.all(
      ["John", "Alice", "David", "Maya", "Noah"].map((name) =>
        registerParticipant(agent, queueId, name),
      ),
    );

    const responses = await Promise.all(
      tokens
        .slice(1)
        .map((token) => agent.patch(`/api/tokens/${token.id}/reorder`).send({ direction: "UP" })),
    );

    for (const response of responses) {
      // Concurrent moves are serialised. A token that already reached the top
      // may legitimately report a boundary conflict instead of moving again.
      expect([200, 409]).toContain(response.status);

      if (response.status === 409) {
        expect(response.body.error.code).toBe("TOKEN_REORDER_BOUNDARY");
      }
    }

    const list = await agent.get(`/api/queues/${queueId}/tokens`);
    const waiting = list.body.data.waiting as TokenBody[];
    const positions = waiting.map((token) => token.position ?? 0).sort((a, b) => a - b);

    expect(positions).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(waiting.map((token) => token.id)).size).toBe(5);
    expect(new Set(waiting.map((token) => token.tokenNumber)).size).toBe(5);
    expect(new Set(waiting.map((token) => token.id))).toEqual(
      new Set(tokens.map((token) => token.id)),
    );
  });
});

describe("POST /api/tokens/:id/cancel", () => {
  it("cancels a waiting token, preserves its record and normalises positions", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");
    const third = await registerParticipant(agent, queueId, "David");

    const response = await agent.post(`/api/tokens/${second.id}/cancel`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Token cancelled successfully");
    expect(response.body.data.token).toMatchObject({
      id: second.id,
      tokenNumber: 2,
      status: "CANCELLED",
      position: null,
    });
    expect(response.body.data.token.cancelledAt).toEqual(expect.any(String));
    expect(response.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([
      first.id,
      third.id,
    ]);
    expect(response.body.data.waiting.map((token: TokenBody) => token.position)).toEqual([1, 2]);
    expect(response.body.data.stats).toMatchObject({
      totalGenerated: 3,
      waitingCount: 2,
      cancelledCount: 1,
    });

    const saved = await prisma.token.findUnique({ where: { id: second.id } });
    expect(saved?.status).toBe("CANCELLED");
    expect(saved?.tokenNumber).toBe(2);
    expect(saved?.position).toBeNull();
    expect(saved?.cancelledAt).not.toBeNull();

    const list = await agent.get(`/api/queues/${queueId}/tokens`);
    expect(list.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([
      first.id,
      third.id,
    ]);
  });

  it("rejects cancelling the same token twice", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const token = await registerParticipant(agent, queueId);

    const first = await agent.post(`/api/tokens/${token.id}/cancel`);
    const second = await agent.post(`/api/tokens/${token.id}/cancel`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("TOKEN_NOT_WAITING");
    expect(second.body.error.message).toMatch(/already been cancelled/i);
  });

  it("never reuses a token number after cancellation", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");

    await agent.post(`/api/tokens/${second.id}/cancel`);
    const third = await registerParticipant(agent, queueId, "David");

    expect(first.tokenNumber).toBe(1);
    expect(second.tokenNumber).toBe(2);
    expect(third.tokenNumber).toBe(3);
    expect(third.displayToken.endsWith("-003")).toBe(true);
    expect(third.position).toBe(2);
  });

  it("hides another manager's token behind a 404", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");
    const token = await registerParticipant(alice.agent, queueId);

    const response = await bob.agent.post(`/api/tokens/${token.id}/cancel`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("TOKEN_NOT_FOUND");

    const saved = await prisma.token.findUnique({ where: { id: token.id } });
    expect(saved?.status).toBe("WAITING");
  });
});

describe("queue waiting counts and deactivation guard", () => {
  it("reports live waiting counts in queue responses", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    await registerParticipant(agent, queueId, "Alice");

    const list = await agent.get("/api/queues");
    const details = await agent.get(`/api/queues/${queueId}`);

    expect(list.body.data[0].waitingCount).toBe(2);
    expect(details.body.data.waitingCount).toBe(2);

    await agent.post(`/api/tokens/${first.id}/cancel`);

    const afterCancel = await agent.get(`/api/queues/${queueId}`);
    expect(afterCancel.body.data.waitingCount).toBe(1);
  });

  it("rejects deactivation while a token is in service", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const token = await registerParticipant(agent, queueId);

    await prisma.token.update({
      where: { id: token.id },
      data: { status: "IN_SERVICE", position: null, serviceStartedAt: new Date() },
    });

    const response = await agent
      .patch(`/api/queues/${queueId}/status`)
      .send({ status: "INACTIVE" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("QUEUE_IN_SERVICE");

    const saved = await prisma.queue.findUnique({ where: { id: queueId } });
    expect(saved?.status).toBe("ACTIVE");
  });

  it("preserves waiting tokens when a queue is deactivated and reactivated", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");
    const first = await registerParticipant(agent, queueId, "John");
    const second = await registerParticipant(agent, queueId, "Alice");

    const deactivated = await agent
      .patch(`/api/queues/${queueId}/status`)
      .send({ status: "INACTIVE" });
    expect(deactivated.status).toBe(200);

    const list = await agent.get(`/api/queues/${queueId}/tokens`);
    expect(list.body.data.waiting.map((token: TokenBody) => token.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(list.body.data.waiting.map((token: TokenBody) => token.position)).toEqual([1, 2]);

    await agent.patch(`/api/queues/${queueId}/status`).send({ status: "ACTIVE" });
    const after = await agent.get(`/api/queues/${queueId}/tokens`);
    expect(after.body.data.waiting).toHaveLength(2);
  });
});

describe("concurrent registration", () => {
  it("generates unique sequential token numbers and positions", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Burst queue");

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        agent
          .post(`/api/queues/${queueId}/tokens`)
          .send({ participantName: `Participant ${index + 1}` }),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(201);
    }

    const tokens = responses.map((response) => response.body.data as TokenBody);
    const tokenNumbers = tokens.map((token) => token.tokenNumber).sort((a, b) => a - b);
    const positions = tokens.map((token) => token.position ?? 0).sort((a, b) => a - b);

    expect(tokenNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(tokens.map((token) => token.id)).size).toBe(10);

    const saved = await prisma.token.findMany({ where: { queueId } });
    expect(new Set(saved.map((token) => token.tokenNumber)).size).toBe(10);
    expect(new Set(saved.map((token) => token.position)).size).toBe(10);
  });
});
