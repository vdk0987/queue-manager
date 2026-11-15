import { Prisma, type QueueStatus } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AnalyticsDashboardQuery } from "./analytics.schemas.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type RangePreset = AnalyticsDashboardQuery["range"];

const PRESET_DAYS: Record<Exclude<RangePreset, "all">, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export interface AnalyticsBucket {
  key: string;
  label: string;
  count: number;
}

export interface AnalyticsDashboardResponse {
  generatedAt: string;
  range: { preset: RangePreset; from: string; to: string; days: number };
  scope: { queueId: string | null; queueName: string | null };
  summary: {
    queues: number;
    activeQueues: number;
    totalTokens: number;
    waiting: number;
    inService: number;
    completed: number;
    cancelled: number;
    registeredInRange: number;
    completedInRange: number;
    cancelledInRange: number;
    completionRate: number | null;
    throughputPerDay: number;
  };
  metrics: {
    averageWaitSeconds: number | null;
    medianWaitSeconds: number | null;
    longestWaitSeconds: number | null;
    averageServiceSeconds: number | null;
    medianServiceSeconds: number | null;
    longestServiceSeconds: number | null;
    peakWaiting: number;
  };
  trend: Array<{
    date: string;
    registered: number;
    completed: number;
    cancelled: number;
    averageWaitSeconds: number | null;
    waitingAtClose: number;
  }>;
  waitingBuckets: AnalyticsBucket[];
  serviceBuckets: AnalyticsBucket[];
  statusMix: { completed: number; cancelled: number };
  queues: Array<{
    id: string;
    name: string;
    waiting: number;
    inService: number;
    completed: number;
    cancelled: number;
    completedInRange: number;
    cancelledInRange: number;
    averageWaitSeconds: number | null;
    averageServiceSeconds: number | null;
  }>;
}

interface DashboardQueue {
  id: string;
  name: string;
  status: QueueStatus;
  timezone: string;
  createdAt: Date;
}

interface DashboardFilter {
  queues: DashboardQueue[];
  queueIds: string[];
  timezone: string;
}

interface QueueAggregateRow {
  queueId: string;
  total: number;
  waiting: number;
  inService: number;
  completed: number;
  cancelled: number;
  registeredInRange: number;
  completedInRange: number;
  cancelledInRange: number;
  averageWaitSeconds: number | null;
  averageServiceSeconds: number | null;
}

interface MetricsRow {
  averageWaitSeconds: number | null;
  medianWaitSeconds: number | null;
  longestWaitSeconds: number | null;
  averageServiceSeconds: number | null;
  medianServiceSeconds: number | null;
  longestServiceSeconds: number | null;
}

interface TrendRow {
  date: string;
  registered: number;
  completed: number;
  cancelled: number;
  averageWaitSeconds: number | null;
  waitingAtClose: number;
}

interface WaitBucketRow {
  under5: number;
  from5to15: number;
  from15to30: number;
  from30to60: number;
  over60: number;
}

interface ServiceBucketRow {
  under5: number;
  from5to10: number;
  from10to20: number;
  from20to40: number;
  over40: number;
}

function normalizeTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

async function resolveDashboardFilter(
  managerId: string,
  queueId?: string,
): Promise<DashboardFilter> {
  const queues = await prisma.queue.findMany({
    where: { managerId, ...(queueId ? { id: queueId } : {}) },
    select: { id: true, name: true, status: true, timezone: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (queueId && queues.length === 0) {
    throw new AppError(404, "QUEUE_NOT_FOUND", "Queue not found.");
  }

  return {
    queues,
    queueIds: queues.map((queue) => queue.id),
    timezone: normalizeTimezone(queueId ? (queues[0]?.timezone ?? "UTC") : "UTC"),
  };
}

function queueScope(queueIds: string[], alias: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`${alias}."queue_id"`)} IN (${Prisma.join(
    queueIds.map((id) => Prisma.sql`${id}::uuid`),
  )})`;
}

async function resolveRange(
  preset: RangePreset,
  timezone: string,
  filter: DashboardFilter,
): Promise<{ from: Date; to: Date; days: number }> {
  const to = new Date();

  if (preset !== "all") {
    const days = PRESET_DAYS[preset];
    const rows = await prisma.$queryRaw<Array<{ from: Date }>>(Prisma.sql`
      SELECT (
        date_trunc('day', now() AT TIME ZONE ${timezone})
        - make_interval(days => ${Prisma.raw(String(days - 1))})
      ) AT TIME ZONE ${timezone} AS "from"
    `);

    return { from: rows[0]?.from ?? new Date(to.getTime() - (days - 1) * DAY_MS), to, days };
  }

  const earliestToken =
    filter.queueIds.length > 0
      ? await prisma.token.findFirst({
          where: { queueId: { in: filter.queueIds } },
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : null;

  const anchors = [earliestToken?.createdAt ?? null, filter.queues[0]?.createdAt ?? null].filter(
    (value): value is Date => value !== null,
  );
  const anchor =
    anchors.length > 0
      ? new Date(Math.min(...anchors.map((value) => value.getTime())))
      : new Date(to.getTime() - 6 * DAY_MS);

  const rows = await prisma.$queryRaw<Array<{ from: Date }>>(Prisma.sql`
    SELECT date_trunc('day', ${anchor}::timestamptz AT TIME ZONE ${timezone})
      AT TIME ZONE ${timezone} AS "from"
  `);
  const from = rows[0]?.from ?? anchor;
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));

  return { from, to, days };
}

async function loadDayLabels(from: Date, to: Date, timezone: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ date: string }>>(Prisma.sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS date
    FROM generate_series(
      ${from}::timestamptz AT TIME ZONE ${timezone},
      ${to}::timestamptz AT TIME ZONE ${timezone},
      '1 day'::interval
    ) AS day
  `);

  return rows.map((row) => row.date);
}

function emptyBuckets(type: "waiting" | "service"): AnalyticsBucket[] {
  if (type === "waiting") {
    return [
      { key: "under5", label: "Under 5 min", count: 0 },
      { key: "5to15", label: "5–15 min", count: 0 },
      { key: "15to30", label: "15–30 min", count: 0 },
      { key: "30to60", label: "30–60 min", count: 0 },
      { key: "60plus", label: "60+ min", count: 0 },
    ];
  }

  return [
    { key: "under5", label: "Under 5 min", count: 0 },
    { key: "5to10", label: "5–10 min", count: 0 },
    { key: "10to20", label: "10–20 min", count: 0 },
    { key: "20to40", label: "20–40 min", count: 0 },
    { key: "40plus", label: "40+ min", count: 0 },
  ];
}

async function emptyDashboard(
  query: AnalyticsDashboardQuery,
  filter: DashboardFilter,
  range: { from: Date; to: Date; days: number },
): Promise<AnalyticsDashboardResponse> {
  const labels = await loadDayLabels(range.from, range.to, filter.timezone);

  return {
    generatedAt: new Date().toISOString(),
    range: {
      preset: query.range,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: range.days,
    },
    scope: {
      queueId: query.queueId ?? null,
      queueName: filter.queues[0]?.name ?? null,
    },
    summary: {
      queues: filter.queues.length,
      activeQueues: filter.queues.filter((queue) => queue.status === "ACTIVE").length,
      totalTokens: 0,
      waiting: 0,
      inService: 0,
      completed: 0,
      cancelled: 0,
      registeredInRange: 0,
      completedInRange: 0,
      cancelledInRange: 0,
      completionRate: null,
      throughputPerDay: 0,
    },
    metrics: {
      averageWaitSeconds: null,
      medianWaitSeconds: null,
      longestWaitSeconds: null,
      averageServiceSeconds: null,
      medianServiceSeconds: null,
      longestServiceSeconds: null,
      peakWaiting: 0,
    },
    trend: labels.map((date) => ({
      date,
      registered: 0,
      completed: 0,
      cancelled: 0,
      averageWaitSeconds: null,
      waitingAtClose: 0,
    })),
    waitingBuckets: emptyBuckets("waiting"),
    serviceBuckets: emptyBuckets("service"),
    statusMix: { completed: 0, cancelled: 0 },
    queues: [],
  };
}

/**
 * Combined dashboard payload. This endpoint powers the one-request dashboard
 * refresh; the focused endpoints (/overview, /trends, …) expose the same data
 * with explicit start/end timestamps for deep links and custom ranges.
 */
export async function getAnalyticsDashboard(
  managerId: string,
  query: AnalyticsDashboardQuery,
): Promise<AnalyticsDashboardResponse> {
  const filter = await resolveDashboardFilter(managerId, query.queueId);
  const range = await resolveRange(query.range, filter.timezone, filter);

  if (filter.queueIds.length === 0) {
    return emptyDashboard(query, filter, range);
  }

  const completedRange = Prisma.sql`t."status" = 'COMPLETED'::"TokenStatus"
    AND t."service_started_at" IS NOT NULL
    AND t."service_completed_at" IS NOT NULL
    AND t."service_completed_at" >= ${range.from}
    AND t."service_completed_at" <= ${range.to}`;

  const [
    queueRows,
    metricsRows,
    trendRows,
    peakRows,
    waitBucketRows,
    serviceBucketRows,
    dayLabels,
  ] = await Promise.all([
    prisma.$queryRaw<QueueAggregateRow[]>(Prisma.sql`
      SELECT
        t."queue_id" AS "queueId",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE t."status" = 'WAITING'::"TokenStatus")::int AS waiting,
        COUNT(*) FILTER (WHERE t."status" = 'IN_SERVICE'::"TokenStatus")::int AS "inService",
        COUNT(*) FILTER (WHERE t."status" = 'COMPLETED'::"TokenStatus")::int AS completed,
        COUNT(*) FILTER (WHERE t."status" = 'CANCELLED'::"TokenStatus")::int AS cancelled,
        COUNT(*) FILTER (
          WHERE t."created_at" >= ${range.from} AND t."created_at" <= ${range.to}
        )::int AS "registeredInRange",
        COUNT(*) FILTER (
          WHERE ${completedRange}
        )::int AS "completedInRange",
        COUNT(*) FILTER (
          WHERE t."status" = 'CANCELLED'::"TokenStatus"
            AND t."cancelled_at" >= ${range.from}
            AND t."cancelled_at" <= ${range.to}
        )::int AS "cancelledInRange",
        ROUND(AVG(
          EXTRACT(EPOCH FROM (t."service_started_at" - t."created_at"))
        ) FILTER (WHERE ${completedRange}))::int AS "averageWaitSeconds",
        ROUND(AVG(
          EXTRACT(EPOCH FROM (t."service_completed_at" - t."service_started_at"))
        ) FILTER (WHERE ${completedRange}))::int AS "averageServiceSeconds"
      FROM "tokens" t
      WHERE ${queueScope(filter.queueIds, "t")}
      GROUP BY t."queue_id"
    `),
    prisma.$queryRaw<MetricsRow[]>(Prisma.sql`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (t."service_started_at" - t."created_at"))))::int
          AS "averageWaitSeconds",
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (t."service_started_at" - t."created_at"))
        ))::int AS "medianWaitSeconds",
        ROUND(MAX(EXTRACT(EPOCH FROM (t."service_started_at" - t."created_at"))))::int
          AS "longestWaitSeconds",
        ROUND(AVG(EXTRACT(EPOCH FROM (t."service_completed_at" - t."service_started_at"))))::int
          AS "averageServiceSeconds",
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (t."service_completed_at" - t."service_started_at"))
        ))::int AS "medianServiceSeconds",
        ROUND(MAX(EXTRACT(EPOCH FROM (t."service_completed_at" - t."service_started_at"))))::int
          AS "longestServiceSeconds"
      FROM "tokens" t
      WHERE ${queueScope(filter.queueIds, "t")}
        AND ${completedRange}
    `),
    prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      WITH days AS (
        SELECT to_char(day, 'YYYY-MM-DD') AS date
        FROM generate_series(
          ${range.from}::timestamptz AT TIME ZONE ${filter.timezone},
          ${range.to}::timestamptz AT TIME ZONE ${filter.timezone},
          '1 day'::interval
        ) AS day
      ),
      registered AS (
        SELECT
          to_char(t."created_at" AT TIME ZONE ${filter.timezone}, 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count
        FROM "tokens" t
        WHERE ${queueScope(filter.queueIds, "t")}
          AND t."created_at" >= ${range.from}
          AND t."created_at" <= ${range.to}
        GROUP BY 1
      ),
      completed AS (
        SELECT
          to_char(t."service_completed_at" AT TIME ZONE ${filter.timezone}, 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count
        FROM "tokens" t
        WHERE ${queueScope(filter.queueIds, "t")}
          AND t."status" = 'COMPLETED'::"TokenStatus"
          AND t."service_completed_at" >= ${range.from}
          AND t."service_completed_at" <= ${range.to}
        GROUP BY 1
      ),
      cancelled AS (
        SELECT
          to_char(t."cancelled_at" AT TIME ZONE ${filter.timezone}, 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count
        FROM "tokens" t
        WHERE ${queueScope(filter.queueIds, "t")}
          AND t."status" = 'CANCELLED'::"TokenStatus"
          AND t."cancelled_at" >= ${range.from}
          AND t."cancelled_at" <= ${range.to}
        GROUP BY 1
      ),
      waits AS (
        SELECT
          to_char(t."service_completed_at" AT TIME ZONE ${filter.timezone}, 'YYYY-MM-DD') AS date,
          ROUND(AVG(EXTRACT(EPOCH FROM (t."service_started_at" - t."created_at"))))::int AS average
        FROM "tokens" t
        WHERE ${queueScope(filter.queueIds, "t")}
          AND ${completedRange}
        GROUP BY 1
      ),
      activity AS (
        SELECT
          to_char(day, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(
            CASE a."event_type"
              WHEN 'TOKEN_CREATED' THEN 1
              WHEN 'SERVICE_STARTED' THEN -1
              WHEN 'TOKEN_CANCELLED' THEN -1
              ELSE 0
            END
          ), 0)::int AS delta
        FROM generate_series(
          ${range.from}::timestamptz AT TIME ZONE ${filter.timezone},
          ${range.to}::timestamptz AT TIME ZONE ${filter.timezone},
          '1 day'::interval
        ) AS day
        LEFT JOIN "queue_activities" a
          ON ${queueScope(filter.queueIds, "a")}
          AND a."created_at" >= day AT TIME ZONE ${filter.timezone}
          AND a."created_at" < (day + INTERVAL '1 day') AT TIME ZONE ${filter.timezone}
        GROUP BY 1
      ),
      baseline AS (
        SELECT COALESCE(SUM(
          CASE a."event_type"
            WHEN 'TOKEN_CREATED' THEN 1
            WHEN 'SERVICE_STARTED' THEN -1
            WHEN 'TOKEN_CANCELLED' THEN -1
            ELSE 0
          END
        ), 0)::int AS count
        FROM "queue_activities" a
        WHERE ${queueScope(filter.queueIds, "a")}
          AND a."created_at" < ${range.from}
      )
      SELECT
        d.date AS date,
        COALESCE(r.count, 0)::int AS registered,
        COALESCE(c.count, 0)::int AS completed,
        COALESCE(x.count, 0)::int AS cancelled,
        w.average AS "averageWaitSeconds",
        ((SELECT count FROM baseline) + SUM(COALESCE(a.delta, 0)) OVER (ORDER BY d.date))::int
          AS "waitingAtClose"
      FROM days d
      LEFT JOIN registered r ON r.date = d.date
      LEFT JOIN completed c ON c.date = d.date
      LEFT JOIN cancelled x ON x.date = d.date
      LEFT JOIN waits w ON w.date = d.date
      LEFT JOIN activity a ON a.date = d.date
      ORDER BY d.date ASC
    `),
    prisma.$queryRaw<Array<{ peakWaiting: number }>>(Prisma.sql`
      WITH events AS (
        SELECT
          a."created_at" AS at,
          CASE a."event_type"
            WHEN 'TOKEN_CREATED' THEN 1
            WHEN 'SERVICE_STARTED' THEN -1
            WHEN 'TOKEN_CANCELLED' THEN -1
            ELSE 0
          END AS delta
        FROM "queue_activities" a
        WHERE ${queueScope(filter.queueIds, "a")}
      ),
      baseline AS (
        SELECT COALESCE(SUM(delta), 0)::int AS count
        FROM events
        WHERE at < ${range.from}
      ),
      running AS (
        SELECT at, SUM(delta) OVER (ORDER BY at) AS cumulative
        FROM events
        WHERE at >= ${range.from} AND at <= ${range.to}
      )
      SELECT COALESCE(
        MAX((SELECT count FROM baseline) + cumulative),
        (SELECT count FROM baseline)
      )::int AS "peakWaiting"
      FROM running
    `),
    prisma.$queryRaw<WaitBucketRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE wait_seconds < 300)::int AS "under5",
        COUNT(*) FILTER (WHERE wait_seconds >= 300 AND wait_seconds < 900)::int AS "from5to15",
        COUNT(*) FILTER (WHERE wait_seconds >= 900 AND wait_seconds < 1800)::int AS "from15to30",
        COUNT(*) FILTER (WHERE wait_seconds >= 1800 AND wait_seconds < 3600)::int AS "from30to60",
        COUNT(*) FILTER (WHERE wait_seconds >= 3600)::int AS "over60"
      FROM (
        SELECT EXTRACT(EPOCH FROM (t."service_started_at" - t."created_at")) AS wait_seconds
        FROM "tokens" t
        WHERE ${queueScope(filter.queueIds, "t")}
          AND ${completedRange}
      ) waits
    `),
    prisma.$queryRaw<ServiceBucketRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE service_seconds < 300)::int AS "under5",
        COUNT(*) FILTER (WHERE service_seconds >= 300 AND service_seconds < 600)::int AS "from5to10",
        COUNT(*) FILTER (WHERE service_seconds >= 600 AND service_seconds < 1200)::int AS "from10to20",
        COUNT(*) FILTER (WHERE service_seconds >= 1200 AND service_seconds < 2400)::int AS "from20to40",
        COUNT(*) FILTER (WHERE service_seconds >= 2400)::int AS "over40"
      FROM (
        SELECT EXTRACT(EPOCH FROM (t."service_completed_at" - t."service_started_at")) AS service_seconds
        FROM "tokens" t
        WHERE ${queueScope(filter.queueIds, "t")}
          AND ${completedRange}
      ) services
    `),
    loadDayLabels(range.from, range.to, filter.timezone),
  ]);

  const aggregateByQueue = new Map(queueRows.map((row) => [row.queueId, row]));
  const queues = filter.queues.map((queue) => {
    const row = aggregateByQueue.get(queue.id);

    return {
      id: queue.id,
      name: queue.name,
      waiting: row?.waiting ?? 0,
      inService: row?.inService ?? 0,
      completed: row?.completed ?? 0,
      cancelled: row?.cancelled ?? 0,
      completedInRange: row?.completedInRange ?? 0,
      cancelledInRange: row?.cancelledInRange ?? 0,
      averageWaitSeconds: row?.averageWaitSeconds ?? null,
      averageServiceSeconds: row?.averageServiceSeconds ?? null,
    };
  });

  const totals = queues.reduce(
    (sum, queue) => ({
      totalTokens: sum.totalTokens + (aggregateByQueue.get(queue.id)?.total ?? 0),
      waiting: sum.waiting + queue.waiting,
      inService: sum.inService + queue.inService,
      completed: sum.completed + queue.completed,
      cancelled: sum.cancelled + queue.cancelled,
      registeredInRange:
        sum.registeredInRange + (aggregateByQueue.get(queue.id)?.registeredInRange ?? 0),
      completedInRange: sum.completedInRange + queue.completedInRange,
      cancelledInRange: sum.cancelledInRange + queue.cancelledInRange,
    }),
    {
      totalTokens: 0,
      waiting: 0,
      inService: 0,
      completed: 0,
      cancelled: 0,
      registeredInRange: 0,
      completedInRange: 0,
      cancelledInRange: 0,
    },
  );

  const resolved = totals.completedInRange + totals.cancelledInRange;
  const metrics = metricsRows[0];
  const waitBuckets = waitBucketRows[0];
  const serviceBuckets = serviceBucketRows[0];
  const trendByDate = new Map(trendRows.map((row) => [row.date, row]));

  return {
    generatedAt: new Date().toISOString(),
    range: {
      preset: query.range,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: range.days,
    },
    scope: {
      queueId: query.queueId ?? null,
      queueName: query.queueId ? (filter.queues[0]?.name ?? null) : null,
    },
    summary: {
      queues: filter.queues.length,
      activeQueues: filter.queues.filter((queue) => queue.status === "ACTIVE").length,
      totalTokens: totals.totalTokens,
      waiting: totals.waiting,
      inService: totals.inService,
      completed: totals.completed,
      cancelled: totals.cancelled,
      registeredInRange: totals.registeredInRange,
      completedInRange: totals.completedInRange,
      cancelledInRange: totals.cancelledInRange,
      completionRate:
        totals.registeredInRange > 0 ? totals.completedInRange / totals.registeredInRange : null,
      throughputPerDay: Math.round((totals.completedInRange / range.days) * 100) / 100,
    },
    metrics: {
      averageWaitSeconds: metrics?.averageWaitSeconds ?? null,
      medianWaitSeconds: metrics?.medianWaitSeconds ?? null,
      longestWaitSeconds: metrics?.longestWaitSeconds ?? null,
      averageServiceSeconds: metrics?.averageServiceSeconds ?? null,
      medianServiceSeconds: metrics?.medianServiceSeconds ?? null,
      longestServiceSeconds: metrics?.longestServiceSeconds ?? null,
      peakWaiting: peakRows[0]?.peakWaiting ?? 0,
    },
    trend: dayLabels.map((date) => {
      const row = trendByDate.get(date);

      return {
        date,
        registered: row?.registered ?? 0,
        completed: row?.completed ?? 0,
        cancelled: row?.cancelled ?? 0,
        averageWaitSeconds: row?.averageWaitSeconds ?? null,
        waitingAtClose: row?.waitingAtClose ?? 0,
      };
    }),
    waitingBuckets: waitBuckets
      ? [
          { key: "under5", label: "Under 5 min", count: waitBuckets.under5 },
          { key: "5to15", label: "5–15 min", count: waitBuckets.from5to15 },
          { key: "15to30", label: "15–30 min", count: waitBuckets.from15to30 },
          { key: "30to60", label: "30–60 min", count: waitBuckets.from30to60 },
          { key: "60plus", label: "60+ min", count: waitBuckets.over60 },
        ]
      : emptyBuckets("waiting"),
    serviceBuckets: serviceBuckets
      ? [
          { key: "under5", label: "Under 5 min", count: serviceBuckets.under5 },
          { key: "5to10", label: "5–10 min", count: serviceBuckets.from5to10 },
          { key: "10to20", label: "10–20 min", count: serviceBuckets.from10to20 },
          { key: "20to40", label: "20–40 min", count: serviceBuckets.from20to40 },
          { key: "40plus", label: "40+ min", count: serviceBuckets.over40 },
        ]
      : emptyBuckets("service"),
    statusMix: { completed: totals.completed, cancelled: totals.cancelled },
    queues,
  };
}
