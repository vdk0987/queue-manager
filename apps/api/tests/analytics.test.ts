import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { TokenStatus } from "@prisma/client";
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

const MINUTE = 60 * 1_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Agent = ReturnType<typeof request.agent>;

interface TokenBody {
  id: string;
  position: number | null;
  queueId: string;
}

interface OverviewBody {
  totalQueues: number;
  activeQueues: number;
  totalTokens: number;
  waitingTokens: number;
  currentlyServing: number;
  completedTokens: number;
  cancelledTokens: number;
  averageWaitingTime: number | null;
  averageServiceDuration: number | null;
  completionRate: number | null;
  cancellationRate: number | null;
  unit: string;
  semantics: {
    live: string[];
    historical: string[];
    timezone: string;
    startDate: string | null;
    endDate: string | null;
  };
}

interface DurationBody {
  sampleSize: number;
  average: number | null;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
}

interface WaitTimesBody extends DurationBody {
  unit: string;
  byStatus: { completed: DurationBody; inService: DurationBody };
  distribution: Array<{ label: string; count: number }>;
  daily: Array<{ date: string; count: number; average: number | null }>;
  timezone: string;
  range: { startDate: string | null; endDate: string | null };
}

interface ServicePerformanceBody {
  totalCompleted: number;
  totalCancelled: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  completionRate: number | null;
  unit: string;
  daily: Array<{ date: string; completed: number; average: number | null }>;
  timezone: string;
  range: { startDate: string | null; endDate: string | null };
}

interface TokenDistributionBody {
  total: number;
  completed: number;
  cancelled: number;
  waiting: number;
  inService: number;
  completionRate: number | null;
  cancellationRate: number | null;
  dailyRegistrations: Array<{
    date: string;
    total: number;
    completed: number;
    cancelled: number;
    waiting: number;
    inService: number;
  }>;
  byQueue: Array<{
    queueId: string;
    name: string;
    total: number;
    completed: number;
    cancelled: number;
    waiting: number;
    inService: number;
    completionRate: number | null;
    cancellationRate: number | null;
  }>;
  timezone: string;
  range: { startDate: string | null; endDate: string | null };
}

interface TrendPointBody {
  timestamp: string;
  waitingCount: number;
}

interface TrendsMetaBody {
  interval: "hourly" | "daily";
  requestedInterval: "hourly" | "daily" | null;
  timezone: string;
  startDate: string;
  endDate: string;
  peakWaitingCount: number;
  averageWaitingCount: number;
  totalIntervals: number;
  queueIds: string[];
}

interface TrendsBody {
  data: TrendPointBody[];
  meta: TrendsMetaBody;
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
  participantName: string,
): Promise<TokenBody> {
  const response = await agent.post(`/api/queues/${queueId}/tokens`).send({ participantName });

  if (response.status !== 201) {
    throw new Error(`Failed to register participant: ${JSON.stringify(response.body)}`);
  }

  return response.body.data as TokenBody;
}

interface SeedOptions {
  name: string;
  status: TokenStatus;
  createdAt: Date;
  serviceStartedAt?: Date;
  serviceCompletedAt?: Date;
  cancelledAt?: Date;
}

/**
 * Seeds a token through the real registration API so token numbers stay
 * realistic, then rewrites its timestamps. The matching TOKEN_CREATED activity
 * moves with it so trend assertions stay deterministic.
 */
async function seedToken(agent: Agent, queueId: string, options: SeedOptions): Promise<TokenBody> {
  const token = await registerParticipant(agent, queueId, options.name);

  await prisma.token.update({
    where: { id: token.id },
    data: {
      status: options.status,
      position: options.status === "WAITING" ? token.position : null,
      createdAt: options.createdAt,
      serviceStartedAt: options.serviceStartedAt ?? null,
      serviceCompletedAt: options.serviceCompletedAt ?? null,
      cancelledAt: options.cancelledAt ?? null,
    },
  });

  await prisma.queueActivity.updateMany({
    where: { tokenId: token.id, eventType: "TOKEN_CREATED" },
    data: { createdAt: options.createdAt },
  });

  return token;
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * MINUTE);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR) * HOUR);
}

async function getJson<T>(
  agent: Agent,
  path: string,
  query: Record<string, string | undefined> = {},
): Promise<{ status: number; data: T; body: unknown; header: Record<string, string> }> {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await agent.get(`/api/analytics${path}${suffix}`);

  return {
    status: response.status,
    data: response.body.data as T,
    body: response.body as unknown,
    header: response.headers as Record<string, string>,
  };
}

function bucketCount(buckets: Array<{ label: string; count: number }>, label: string): number {
  return buckets.find((bucket) => bucket.label === label)?.count ?? 0;
}

/**
 * The trends endpoint returns its points in `data` and its metadata in `meta`
 * (a sibling of `data`), unlike the other analytics endpoints.
 */
function trendBody(response: { body: unknown }): TrendsBody {
  return response.body as TrendsBody;
}

describe("analytics authentication", () => {
  it("requires a session on every analytics endpoint", async () => {
    const endpoints = [
      "/dashboard",
      "/overview",
      "/trends",
      "/wait-times",
      "/service-performance",
      "/token-distribution",
    ];

    for (const endpoint of endpoints) {
      const response = await request(app).get(`/api/analytics${endpoint}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("disables caching for an authenticated manager", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const response = await getJson<OverviewBody>(agent, "/overview");

    expect(response.status).toBe(200);
    expect(response.header["cache-control"]).toBe("no-store");
  });
});

describe("GET /api/analytics/overview", () => {
  it("returns a stable empty overview for a manager with no queues", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const response = await getJson<OverviewBody>(agent, "/overview");

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      totalQueues: 0,
      activeQueues: 0,
      totalTokens: 0,
      waitingTokens: 0,
      currentlyServing: 0,
      completedTokens: 0,
      cancelledTokens: 0,
      averageWaitingTime: null,
      averageServiceDuration: null,
      completionRate: null,
      cancellationRate: null,
      unit: "seconds",
    });
    expect(response.data.semantics.timezone).toBe("UTC");
    expect(response.data.semantics.startDate).toBeNull();
    expect(response.data.semantics.endDate).toBeNull();
  });

  it("summarises live state alongside historical averages", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "General Consultation");

    // Completed: 10m wait / 5m service, then 20m wait / 10m service.
    await seedToken(agent, queueId, {
      name: "John",
      status: "COMPLETED",
      createdAt: minutesAgo(135),
      serviceStartedAt: minutesAgo(125),
      serviceCompletedAt: minutesAgo(120),
    });
    await seedToken(agent, queueId, {
      name: "Alice",
      status: "COMPLETED",
      createdAt: minutesAgo(90),
      serviceStartedAt: minutesAgo(70),
      serviceCompletedAt: minutesAgo(60),
    });
    await seedToken(agent, queueId, {
      name: "David",
      status: "CANCELLED",
      createdAt: minutesAgo(180),
      cancelledAt: minutesAgo(150),
    });
    await seedToken(agent, queueId, {
      name: "Maya",
      status: "WAITING",
      createdAt: minutesAgo(180),
    });
    await seedToken(agent, queueId, {
      name: "Noah",
      status: "IN_SERVICE",
      createdAt: minutesAgo(60),
      serviceStartedAt: minutesAgo(30),
    });

    const response = await getJson<OverviewBody>(agent, "/overview");

    expect(response.data).toMatchObject({
      totalQueues: 1,
      activeQueues: 1,
      totalTokens: 5,
      waitingTokens: 1,
      currentlyServing: 1,
      completedTokens: 2,
      cancelledTokens: 1,
      // Completed and in-service waits: (600 + 1200 + 1800) / 3.
      averageWaitingTime: 1_200,
      // Completed service durations: (300 + 600) / 2.
      averageServiceDuration: 450,
      completionRate: 40,
      cancellationRate: 20,
      unit: "seconds",
    });
  });

  it("applies the date range to the historical cohort but keeps live counters live", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Support");

    await seedToken(agent, queueId, {
      name: "Recent",
      status: "COMPLETED",
      createdAt: minutesAgo(60),
      serviceStartedAt: minutesAgo(50),
      serviceCompletedAt: minutesAgo(40),
    });
    await seedToken(agent, queueId, {
      name: "Old",
      status: "COMPLETED",
      createdAt: daysAgo(40),
      serviceStartedAt: daysAgo(40),
      serviceCompletedAt: daysAgo(40),
    });
    await seedToken(agent, queueId, {
      name: "Still waiting",
      status: "WAITING",
      createdAt: daysAgo(40),
    });

    const startDate = daysAgo(7);
    const response = await getJson<OverviewBody>(agent, "/overview", {
      startDate: startDate.toISOString(),
    });

    expect(response.data).toMatchObject({
      totalTokens: 1,
      completedTokens: 1,
      cancelledTokens: 0,
      averageWaitingTime: 600,
      averageServiceDuration: 600,
      completionRate: 100,
      // Snapshot counters are not limited by the selected range.
      waitingTokens: 1,
    });
    expect(response.data.semantics.startDate).toBe(startDate.toISOString());
  });
});

describe("GET /api/analytics/wait-times", () => {
  async function seedMixedQueue() {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Walk-ins");

    await seedToken(agent, queueId, {
      name: "John",
      status: "COMPLETED",
      createdAt: minutesAgo(135),
      serviceStartedAt: minutesAgo(125),
      serviceCompletedAt: minutesAgo(120),
    });
    await seedToken(agent, queueId, {
      name: "Alice",
      status: "COMPLETED",
      createdAt: minutesAgo(90),
      serviceStartedAt: minutesAgo(70),
      serviceCompletedAt: minutesAgo(60),
    });
    await seedToken(agent, queueId, {
      name: "Noah",
      status: "IN_SERVICE",
      createdAt: minutesAgo(60),
      serviceStartedAt: minutesAgo(30),
    });

    return agent;
  }

  it("reports duration statistics, status splits and distribution buckets", async () => {
    const agent = await seedMixedQueue();
    const response = await getJson<WaitTimesBody>(agent, "/wait-times");

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      sampleSize: 3,
      average: 1_200,
      median: 1_200,
      minimum: 600,
      maximum: 1_800,
      unit: "seconds",
    });
    expect(response.data.byStatus.completed).toMatchObject({
      sampleSize: 2,
      average: 900,
      median: 900,
      minimum: 600,
      maximum: 1_200,
    });
    expect(response.data.byStatus.inService).toMatchObject({
      sampleSize: 1,
      average: 1_800,
      median: 1_800,
    });
    expect(bucketCount(response.data.distribution, "10–20 min")).toBe(1);
    expect(bucketCount(response.data.distribution, "20–30 min")).toBe(1);
    expect(bucketCount(response.data.distribution, "30–60 min")).toBe(1);
    expect(response.data.daily.reduce((sum, point) => sum + point.count, 0)).toBe(3);
  });

  it("filters by the service start date", async () => {
    const agent = await seedMixedQueue();
    const startDate = minutesAgo(100);
    const response = await getJson<WaitTimesBody>(agent, "/wait-times", {
      startDate: startDate.toISOString(),
    });

    expect(response.data.sampleSize).toBe(2);
    expect(response.data.average).toBe(1_500);
    expect(response.data.byStatus.completed.sampleSize).toBe(1);
    expect(response.data.range.startDate).toBe(startDate.toISOString());
  });
});

describe("GET /api/analytics/service-performance", () => {
  it("compares completed and cancelled outcomes", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Consultations");

    await seedToken(agent, queueId, {
      name: "John",
      status: "COMPLETED",
      createdAt: minutesAgo(135),
      serviceStartedAt: minutesAgo(125),
      serviceCompletedAt: minutesAgo(120),
    });
    await seedToken(agent, queueId, {
      name: "Alice",
      status: "COMPLETED",
      createdAt: minutesAgo(90),
      serviceStartedAt: minutesAgo(70),
      serviceCompletedAt: minutesAgo(60),
    });
    await seedToken(agent, queueId, {
      name: "David",
      status: "CANCELLED",
      createdAt: minutesAgo(180),
      cancelledAt: minutesAgo(150),
    });

    const response = await getJson<ServicePerformanceBody>(agent, "/service-performance");

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      totalCompleted: 2,
      totalCancelled: 1,
      average: 450,
      minimum: 300,
      maximum: 600,
      completionRate: 66.7,
      unit: "seconds",
    });
    expect(response.data.daily.reduce((sum, point) => sum + point.completed, 0)).toBe(2);
  });

  it("scopes the outcome comparison to the selected range", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Range");

    await seedToken(agent, queueId, {
      name: "Recent",
      status: "COMPLETED",
      createdAt: minutesAgo(60),
      serviceStartedAt: minutesAgo(50),
      serviceCompletedAt: minutesAgo(40),
    });
    await seedToken(agent, queueId, {
      name: "Old cancellation",
      status: "CANCELLED",
      createdAt: daysAgo(10),
      cancelledAt: daysAgo(10),
    });

    const response = await getJson<ServicePerformanceBody>(agent, "/service-performance", {
      startDate: daysAgo(1).toISOString(),
    });

    expect(response.data).toMatchObject({
      totalCompleted: 1,
      totalCancelled: 0,
      completionRate: 100,
    });
  });
});

describe("GET /api/analytics/token-distribution", () => {
  it("breaks tokens down by outcome, day and queue", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const firstQueue = await createQueue(agent, "First queue");
    const secondQueue = await createQueue(agent, "Second queue");

    await seedToken(agent, firstQueue, {
      name: "Completed one",
      status: "COMPLETED",
      createdAt: minutesAgo(120),
      serviceStartedAt: minutesAgo(110),
      serviceCompletedAt: minutesAgo(100),
    });
    await seedToken(agent, firstQueue, {
      name: "Cancelled one",
      status: "CANCELLED",
      createdAt: minutesAgo(90),
      cancelledAt: minutesAgo(80),
    });
    await seedToken(agent, secondQueue, {
      name: "Waiting one",
      status: "WAITING",
      createdAt: minutesAgo(60),
    });
    await seedToken(agent, secondQueue, {
      name: "Serving one",
      status: "IN_SERVICE",
      createdAt: minutesAgo(30),
      serviceStartedAt: minutesAgo(10),
    });

    const response = await getJson<TokenDistributionBody>(agent, "/token-distribution");

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      total: 4,
      completed: 1,
      cancelled: 1,
      waiting: 1,
      inService: 1,
      completionRate: 25,
      cancellationRate: 25,
    });
    expect(response.data.byQueue).toHaveLength(2);
    expect(response.data.byQueue.find((queue) => queue.queueId === firstQueue)).toMatchObject({
      total: 2,
      completed: 1,
      cancelled: 1,
      completionRate: 50,
    });
    expect(response.data.dailyRegistrations.reduce((sum, point) => sum + point.total, 0)).toBe(4);
  });

  it("limits the cohort to tokens registered inside the range", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Cohorts");

    await seedToken(agent, queueId, {
      name: "Recent",
      status: "COMPLETED",
      createdAt: minutesAgo(30),
      serviceStartedAt: minutesAgo(20),
      serviceCompletedAt: minutesAgo(10),
    });
    await seedToken(agent, queueId, {
      name: "Old",
      status: "CANCELLED",
      createdAt: daysAgo(10),
      cancelledAt: daysAgo(10),
    });

    const response = await getJson<TokenDistributionBody>(agent, "/token-distribution", {
      startDate: daysAgo(1).toISOString(),
    });

    expect(response.data).toMatchObject({
      total: 1,
      completed: 1,
      cancelled: 0,
      completionRate: 100,
      cancellationRate: 0,
    });
    expect(response.data.dailyRegistrations).toHaveLength(1);
  });
});

describe("GET /api/analytics/trends", () => {
  it("reconstructs the waiting line from activity events", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Trend queue");
    const first = await registerParticipant(agent, queueId, "First");
    await registerParticipant(agent, queueId, "Second");

    await prisma.queueActivity.deleteMany({ where: { queueId } });
    await prisma.queueActivity.createMany({
      data: [
        { queueId, tokenId: first.id, eventType: "TOKEN_CREATED", createdAt: daysAgo(3) },
        { queueId, tokenId: first.id, eventType: "SERVICE_STARTED", createdAt: daysAgo(2) },
        { queueId, eventType: "TOKEN_CREATED", createdAt: daysAgo(1) },
      ],
    });

    const startDate = startOfUtcDay(daysAgo(4));
    const response = await getJson<TrendsBody>(agent, "/trends", {
      startDate: startDate.toISOString(),
      interval: "daily",
    });

    expect(response.status).toBe(200);
    const body = trendBody(response);
    expect(body.meta).toMatchObject({
      interval: "daily",
      requestedInterval: "daily",
      timezone: "UTC",
      peakWaitingCount: 1,
      averageWaitingCount: 1,
      totalIntervals: 5,
      queueIds: [queueId],
    });
    expect(body.data.map((point) => point.waitingCount)).toEqual([0, 1, 0, 1, 1]);
  });

  it("supports hourly buckets for short ranges", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Hourly queue");
    const token = await registerParticipant(agent, queueId, "Hourly participant");

    await prisma.queueActivity.deleteMany({ where: { queueId } });

    const startDate = new Date(startOfUtcHour(new Date()).getTime() - 2 * HOUR);
    const endDate = startOfUtcHour(new Date());

    await prisma.queueActivity.createMany({
      data: [
        {
          queueId,
          tokenId: token.id,
          eventType: "TOKEN_CREATED",
          createdAt: new Date(startDate.getTime() + 30 * MINUTE),
        },
        {
          queueId,
          tokenId: token.id,
          eventType: "SERVICE_STARTED",
          createdAt: new Date(startDate.getTime() + 90 * MINUTE),
        },
      ],
    });

    const response = await getJson<TrendsBody>(agent, "/trends", {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      interval: "hourly",
    });

    const body = trendBody(response);
    expect(body.meta.interval).toBe("hourly");
    expect(body.meta.totalIntervals).toBe(3);
    expect(body.data.map((point) => point.waitingCount)).toEqual([1, 0, 0]);
  });

  it("falls back to a daily interval for long hourly requests", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Long queue");

    const response = await getJson<TrendsBody>(agent, "/trends", {
      queueId,
      startDate: daysAgo(120).toISOString(),
      interval: "hourly",
    });

    const body = trendBody(response);
    expect(body.meta.interval).toBe("daily");
    expect(body.meta.requestedInterval).toBe("hourly");
  });

  it("returns an empty series for a manager without queues", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const response = await getJson<TrendsBody>(agent, "/trends");

    expect(response.status).toBe(200);
    const body = trendBody(response);
    expect(body.data).toEqual([]);
    expect(body.meta.totalIntervals).toBe(0);
    expect(body.meta.queueIds).toEqual([]);
  });
});

describe("analytics scoping", () => {
  async function seedTwoQueues() {
    const { agent } = await registerManager(ACCOUNT_A);
    const firstQueue = await createQueue(agent, "First queue");
    const secondQueue = await createQueue(agent, "Second queue");

    await seedToken(agent, firstQueue, {
      name: "Fast",
      status: "COMPLETED",
      createdAt: minutesAgo(20),
      serviceStartedAt: minutesAgo(10),
      serviceCompletedAt: minutesAgo(5),
    });

    await seedToken(agent, secondQueue, {
      name: "Slow",
      status: "COMPLETED",
      createdAt: minutesAgo(50),
      serviceStartedAt: minutesAgo(20),
      serviceCompletedAt: minutesAgo(5),
    });

    return { agent, firstQueue, secondQueue };
  }

  it("scopes every endpoint to a single queue", async () => {
    const { agent, firstQueue } = await seedTwoQueues();

    const overview = await getJson<OverviewBody>(agent, "/overview", { queueId: firstQueue });
    expect(overview.data.totalQueues).toBe(1);
    expect(overview.data.totalTokens).toBe(1);
    expect(overview.data.averageWaitingTime).toBe(600);

    const waitTimes = await getJson<WaitTimesBody>(agent, "/wait-times", { queueId: firstQueue });
    expect(waitTimes.data.sampleSize).toBe(1);
    expect(waitTimes.data.average).toBe(600);

    const performance = await getJson<ServicePerformanceBody>(agent, "/service-performance", {
      queueId: firstQueue,
    });
    expect(performance.data.totalCompleted).toBe(1);

    const distribution = await getJson<TokenDistributionBody>(agent, "/token-distribution", {
      queueId: firstQueue,
    });
    expect(distribution.data.byQueue).toHaveLength(1);
    expect(distribution.data.byQueue[0]?.queueId).toBe(firstQueue);

    const trends = await getJson<TrendsBody>(agent, "/trends", { queueId: firstQueue });
    expect(trendBody(trends).meta.queueIds).toEqual([firstQueue]);
  });

  it("never exposes another manager's queues", async () => {
    const alice = await registerManager(ACCOUNT_A);
    const bob = await registerManager(ACCOUNT_B);
    const aliceQueue = await createQueue(alice.agent, "Alice private queue");

    for (const endpoint of [
      "/dashboard",
      "/overview",
      "/trends",
      "/wait-times",
      "/service-performance",
      "/token-distribution",
    ]) {
      const response = await getJson(bob.agent, endpoint, { queueId: aliceQueue });
      expect(response.status).toBe(404);
      expect((response.body as { error: { code: string } }).error.code).toBe("QUEUE_NOT_FOUND");
    }
  });
});

describe("GET /api/analytics/dashboard", () => {
  it("returns the combined dashboard payload with historical waiting snapshots", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Dashboard queue");

    await seedToken(agent, queueId, {
      name: "Completed",
      status: "COMPLETED",
      createdAt: minutesAgo(40),
      serviceStartedAt: minutesAgo(30),
      serviceCompletedAt: minutesAgo(20),
    });
    await seedToken(agent, queueId, {
      name: "Waiting",
      status: "WAITING",
      createdAt: minutesAgo(10),
    });
    const completed = await prisma.token.findFirst({
      where: { queueId, participantName: "Completed" },
      select: { id: true, serviceStartedAt: true },
    });
    if (completed?.serviceStartedAt) {
      await prisma.queueActivity.create({
        data: {
          queueId,
          tokenId: completed.id,
          eventType: "SERVICE_STARTED",
          createdAt: completed.serviceStartedAt,
        },
      });
    }

    const response = await getJson<{
      summary: { registeredInRange: number; completedInRange: number };
      metrics: { peakWaiting: number };
      trend: Array<{ registered: number; waitingAtClose: number }>;
    }>(agent, "/dashboard", { range: "7d", queueId });

    expect(response.status).toBe(200);
    expect(response.data.summary).toMatchObject({ registeredInRange: 2, completedInRange: 1 });
    expect(response.data.metrics.peakWaiting).toBe(1);
    expect(response.data.trend.at(-1)?.waitingAtClose).toBe(1);
  });
});

describe("analytics validation", () => {
  it("rejects malformed filters and impossible ranges", async () => {
    const { agent } = await registerManager(ACCOUNT_A);

    const malformedQueue = await getJson(agent, "/overview", { queueId: "not-a-uuid" });
    expect(malformedQueue.status).toBe(400);
    expect(
      (malformedQueue.body as { error: { details: { fieldErrors: { queueId: string[] } } } }).error
        .details.fieldErrors.queueId,
    ).toEqual(expect.any(Array));

    const malformedDate = await getJson(agent, "/wait-times", { startDate: "not-a-date" });
    expect(malformedDate.status).toBe(400);
    expect(
      (malformedDate.body as { error: { details: { fieldErrors: { startDate: string[] } } } }).error
        .details.fieldErrors.startDate,
    ).toEqual(expect.any(Array));

    const backwards = await getJson(agent, "/service-performance", {
      startDate: daysAgo(1).toISOString(),
      endDate: daysAgo(2).toISOString(),
    });
    expect(backwards.status).toBe(400);
    expect(
      (backwards.body as { error: { details: { fieldErrors: { endDate: string[] } } } }).error
        .details.fieldErrors.endDate,
    ).toEqual(expect.any(Array));

    const malformedInterval = await getJson(agent, "/trends", { interval: "weekly" });
    expect(malformedInterval.status).toBe(400);

    const tenYears = await getJson(agent, "/trends", {
      startDate: daysAgo(4_000).toISOString(),
    });
    expect(tenYears.status).toBe(400);
    expect((tenYears.body as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");

    const blankQueue = await getJson<OverviewBody>(agent, "/overview", { queueId: "" });
    expect(blankQueue.status).toBe(200);

    const unknownQueue = await getJson(agent, "/overview", { queueId: randomUUID() });
    expect(unknownQueue.status).toBe(404);
    expect((unknownQueue.body as { error: { code: string } }).error.code).toBe("QUEUE_NOT_FOUND");
  });
});

describe("queue activity log", () => {
  it("records lifecycle mutations as append-only events", async () => {
    const { agent } = await registerManager(ACCOUNT_A);
    const queueId = await createQueue(agent, "Activity queue");
    const first = await registerParticipant(agent, queueId, "First");
    const second = await registerParticipant(agent, queueId, "Second");

    await agent.post(`/api/queues/${queueId}/next`).expect(200);
    await agent.post(`/api/tokens/${first.id}/complete`).expect(200);
    await agent.post(`/api/tokens/${second.id}/cancel`).expect(200);
    await agent.patch(`/api/queues/${queueId}/status`).send({ status: "INACTIVE" }).expect(200);
    await agent.patch(`/api/queues/${queueId}/status`).send({ status: "ACTIVE" }).expect(200);

    const events = await prisma.queueActivity.findMany({
      where: { queueId },
      orderBy: { createdAt: "asc" },
      select: { eventType: true, tokenId: true },
    });
    const types = events.map((event) => event.eventType);

    expect(types.filter((type) => type === "TOKEN_CREATED")).toHaveLength(2);
    expect(types).toContain("SERVICE_STARTED");
    expect(types).toContain("SERVICE_COMPLETED");
    expect(types).toContain("TOKEN_CANCELLED");
    expect(types).toContain("QUEUE_DEACTIVATED");
    expect(types).toContain("QUEUE_ACTIVATED");
    expect(events.find((event) => event.eventType === "SERVICE_STARTED")?.tokenId).toBe(first.id);
  });
});
