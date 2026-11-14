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

describe("queue authentication", () => {
  it("requires a session for every queue endpoint", async () => {
    const queueId = randomUUID();

    const list = await request(app).get("/api/queues");
    const create = await request(app).post("/api/queues").send({ name: "Support" });
    const details = await request(app).get(`/api/queues/${queueId}`);
    const rename = await request(app).patch(`/api/queues/${queueId}`).send({ name: "Renamed" });
    const status = await request(app)
      .patch(`/api/queues/${queueId}/status`)
      .send({ status: "INACTIVE" });

    for (const response of [list, create, details, rename, status]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("POST /api/queues", () => {
  it("creates an active queue owned by the authenticated manager", async () => {
    const { agent, manager } = await registerManager(ACCOUNT_A);

    const response = await agent.post("/api/queues").send({ name: "General Consultation" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "General Consultation",
        status: "ACTIVE",
        waitingCount: 0,
      },
    });
    expect(response.body.data.id).toEqual(expect.any(String));
    expect(response.body.data.createdAt).toEqual(expect.any(String));
    expect(response.body.data).not.toHaveProperty("managerId");
    expect(response.body.data).not.toHaveProperty("manager");

    const saved = await prisma.queue.findUnique({
      where: { id: response.body.data.id },
    });
    expect(saved?.managerId).toBe(manager.id);
  });

  it("trims and collapses whitespace in queue names", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const response = await agent.post("/api/queues").send({ name: "  Priority   Consultation  " });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Priority Consultation");
  });

  it("rejects empty and whitespace-only names", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const empty = await agent.post("/api/queues").send({ name: "" });
    const spaces = await agent.post("/api/queues").send({ name: "   " });
    const missing = await agent.post("/api/queues").send({});

    for (const response of [empty, spaces, missing]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details.fieldErrors.name).toEqual(expect.any(Array));
    }
  });

  it("rejects names longer than 100 characters", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const response = await agent.post("/api/queues").send({ name: "a".repeat(101) });

    expect(response.status).toBe(400);
    expect(response.body.error.details.fieldErrors.name.join(" ")).toMatch(/100/);
  });

  it("ignores a manager ID supplied by the client", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);

    const response = await alice.agent
      .post("/api/queues")
      .send({ name: "Owned by Alice", managerId: bob.manager.id });

    expect(response.status).toBe(201);

    const saved = await prisma.queue.findUnique({ where: { id: response.body.data.id } });
    expect(saved?.managerId).toBe(alice.manager.id);
  });
});

describe("GET /api/queues", () => {
  it("returns an empty list for a new manager", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const response = await agent.get("/api/queues");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
  });

  it("returns only the authenticated manager's queues, newest first", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);

    await createQueue(alice.agent, "First queue");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await createQueue(alice.agent, "Second queue");
    await createQueue(bob.agent, "Bob's queue");

    const aliceResponse = await alice.agent.get("/api/queues");
    const bobResponse = await bob.agent.get("/api/queues");

    expect(aliceResponse.status).toBe(200);
    expect(aliceResponse.body.data.map((queue: { name: string }) => queue.name)).toEqual([
      "Second queue",
      "First queue",
    ]);
    expect(aliceResponse.body.data[0]).toMatchObject({
      status: "ACTIVE",
      waitingCount: 0,
    });
    expect(aliceResponse.body.data[0].createdAt).toEqual(expect.any(String));

    expect(bobResponse.body.data.map((queue: { name: string }) => queue.name)).toEqual([
      "Bob's queue",
    ]);
  });
});

describe("GET /api/queues/:id", () => {
  it("returns queue details to its owner", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const response = await agent.get(`/api/queues/${queueId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: queueId,
        name: "Support",
        status: "ACTIVE",
        waitingCount: 0,
      },
    });
  });

  it("hides another manager's queue behind a 404", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");

    const response = await bob.agent.get(`/api/queues/${queueId}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");
  });

  it("returns 404 for a valid but unknown queue ID", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const response = await agent.get(`/api/queues/${randomUUID()}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");
  });

  it("returns a validation error for a malformed queue ID", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const response = await agent.get("/api/queues/not-a-uuid");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/queues/:id", () => {
  it("renames a queue and refreshes its updated timestamp", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Old name");
    const before = await agent.get(`/api/queues/${queueId}`);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const response = await agent
      .patch(`/api/queues/${queueId}`)
      .send({ name: "  Priority   Consultation  " });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Priority Consultation");
    expect(response.body.data.status).toBe("ACTIVE");
    expect(new Date(response.body.data.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before.body.data.updatedAt).getTime(),
    );

    const saved = await prisma.queue.findUnique({ where: { id: queueId } });
    expect(saved?.name).toBe("Priority Consultation");
  });

  it("rejects an empty update or blank name", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const empty = await agent.patch(`/api/queues/${queueId}`).send({});
    const blank = await agent.patch(`/api/queues/${queueId}`).send({ name: "   " });

    for (const response of [empty, blank]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details.fieldErrors.name).toEqual(expect.any(Array));
    }
  });

  it("rejects names longer than 100 characters", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const response = await agent.patch(`/api/queues/${queueId}`).send({ name: "a".repeat(101) });

    expect(response.status).toBe(400);
  });

  it("cannot rename another manager's queue", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");

    const response = await bob.agent.patch(`/api/queues/${queueId}`).send({ name: "Hijacked" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");

    const saved = await prisma.queue.findUnique({ where: { id: queueId } });
    expect(saved?.name).toBe("Private queue");
  });
});

describe("PATCH /api/queues/:id/status", () => {
  it("deactivates and reactivates a queue", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const deactivated = await agent
      .patch(`/api/queues/${queueId}/status`)
      .send({ status: "INACTIVE" });

    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.status).toBe("INACTIVE");

    const listed = await agent.get("/api/queues");
    expect(listed.body.data[0].status).toBe("INACTIVE");

    const activated = await agent.patch(`/api/queues/${queueId}/status`).send({ status: "ACTIVE" });

    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe("ACTIVE");

    const saved = await prisma.queue.findUnique({ where: { id: queueId } });
    expect(saved?.status).toBe("ACTIVE");
  });

  it("rejects an unsupported status", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    const response = await agent.patch(`/api/queues/${queueId}/status`).send({ status: "PAUSED" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.fieldErrors.status).toEqual(expect.any(Array));
  });

  it("cannot change the status of another manager's queue", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const queueId = await createQueue(alice.agent, "Private queue");

    const response = await bob.agent
      .patch(`/api/queues/${queueId}/status`)
      .send({ status: "INACTIVE" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");

    const saved = await prisma.queue.findUnique({ where: { id: queueId } });
    expect(saved?.status).toBe("ACTIVE");
  });

  it("returns 404 for a valid but unknown queue ID", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const response = await agent
      .patch(`/api/queues/${randomUUID()}/status`)
      .send({ status: "INACTIVE" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("QUEUE_NOT_FOUND");
  });
});
