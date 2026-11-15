import { Prisma, type QueueStatus, type TokenStatus } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AnalyticsQuery, AnalyticsTrendsQuery } from "./analytics.schemas.js";

const DEFAULT_TREND_DAYS = 7;
const MAX_HOURLY_RANGE_DAYS = 90;
const SECONDS_PER_DAY = 24 * 60 * 60;

type TrendInterval = "hourly" | "daily";

interface AnalyticsQueue {
  id: string;
  name: string;
  code: string;
  status: QueueStatus;
  timezone: string;
  createdAt: Date;
}

interface AnalyticsFilter {
  queues: AnalyticsQueue[];
  queueIds: string[];
  timezone: string;
  startDate: Date | null;
  endDate: Date | null;
}

interface SemanticsMeta {
  /** Live values describe the database right now. */
  live: string[];
  /** Historical values describe persisted events inside the selected range. */
  historical: string[];
  timezone: string;
  startDate: string | null;
  endDate: string | null;
}

export interface OverviewResponse {
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
  unit: "seconds";
  semantics: SemanticsMeta;
}

export interface TrendPoint {
  timestamp: string;
  waitingCount: number;
}

export interface TrendsResponse {
  data: TrendPoint[];
  meta: {
    interval: TrendInterval;
    requestedInterval: TrendInterval | null;
    timezone: string;
    startDate: string;
    endDate: string;
    peakWaitingCount: number;
    averageWaitingCount: number;
    totalIntervals: number;
    queueIds: string[];
  };
}

interface DurationMetrics {
  sampleSize: number;
  average: number | null;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
}

export interface WaitTimesResponse extends DurationMetrics {
  unit: "seconds";
  byStatus: {
    completed: DurationMetrics;
    inService: DurationMetrics;
  };
  distribution: Array<{ label: string; count: number }>;
  daily: Array<{ date: string; count: number; average: number | null }>;
  timezone: string;
  range: { startDate: string | null; endDate: string | null };
}

export interface ServicePerformanceResponse {
  totalCompleted: number;
  totalCancelled: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  completionRate: number | null;
  unit: "seconds";
  daily: Array<{ date: string; completed: number; average: number | null }>;
  timezone: string;
  range: { startDate: string | null; endDate: string | null };
}

export interface QueueDistribution {
  queueId: string;
  name: string;
  code: string;
  total: number;
  completed: number;
  cancelled: number;
  waiting: number;
  inService: number;
  completionRate: number | null;
  cancellationRate: number | null;
}

export interface TokenDistributionResponse {
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
  byQueue: QueueDistribution[];
  timezone: string;
  range: { startDate: string | null; endDate: string | null };
}

function queueNotFound(): AppError {
  return new AppError(404, "QUEUE_NOT_FOUND", "Queue not found.");
}

/** Falls back to UTC if a stored timezone is not recognised by this Node build. */
function normalizeTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

async function resolveFilter(managerId: string, query: AnalyticsQuery): Promise<AnalyticsFilter> {
  const queues = await prisma.queue.findMany({
    where: {
      managerId,
      ...(query.queueId ? { id: query.queueId } : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      timezone: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (query.queueId && queues.length === 0) {
    throw queueNotFound();
  }

  return {
    queues,
    queueIds: queues.map((queue) => queue.id),
    // A single queue carries its local calendar. Mixed queues use UTC so the
    // same instant always falls into one predictable bucket.
    timezone: normalizeTimezone(query.queueId ? (queues[0]?.timezone ?? "UTC") : "UTC"),
    startDate: query.startDate ?? null,
    endDate: query.endDate ?? null,
  };
}

function queueScope(queueIds: string[], alias: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`${alias}."queue_id"`)} IN (${Prisma.join(
    queueIds.map((id) => Prisma.sql`${id}::uuid`),
  )})`;
}

function activityQueueScope(queueIds: string[], alias: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`${alias}."queue_id"`)} IN (${Prisma.join(
    queueIds.map((id) => Prisma.sql`${id}::uuid`),
  )})`;
}

function timestampCondition(alias: string, column: string, filter: AnalyticsFilter): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const reference = Prisma.raw(`${alias}."${column}"`);

  if (filter.startDate) {
    parts.push(Prisma.sql`${reference} >= ${filter.startDate}`);
  }

  if (filter.endDate) {
    parts.push(Prisma.sql`${reference} <= ${filter.endDate}`);
  }

  return parts.length > 0 ? Prisma.sql` AND ${Prisma.join(parts, " AND ")}` : Prisma.sql``;
}

function rangeMeta(filter: AnalyticsFilter) {
  return {
    startDate: filter.startDate?.toISOString() ?? null,
    endDate: filter.endDate?.toISOString() ?? null,
  };
}

function rate(part: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return Math.round((part / total) * 1000) / 10;
}

function emptyDurationMetrics(): DurationMetrics {
  return {
    sampleSize: 0,
    average: null,
    median: null,
    minimum: null,
    maximum: null,
  };
}

function emptyOverview(filter: AnalyticsFilter): OverviewResponse {
  return {
    totalQueues: filter.queues.length,
    activeQueues: filter.queues.filter((queue) => queue.status === "ACTIVE").length,
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
    semantics: {
      live: ["waitingTokens", "currentlyServing", "totalQueues", "activeQueues"],
      historical: [
        "totalTokens",
        "completedTokens",
        "cancelledTokens",
        "averageWaitingTime",
        "averageServiceDuration",
      ],
      timezone: filter.timezone,
      ...rangeMeta(filter),
    },
  };
}

interface AverageRow {
  average: number | null;
}

export async function getOverview(
  managerId: string,
  query: AnalyticsQuery,
): Promise<OverviewResponse> {
  const filter = await resolveFilter(managerId, query);

  if (filter.queueIds.length === 0) {
    return emptyOverview(filter);
  }

  const createdAtFilter: Prisma.DateTimeFilter = {};
  if (filter.startDate) createdAtFilter.gte = filter.startDate;
  if (filter.endDate) createdAtFilter.lte = filter.endDate;

  const cohortWhere = {
    queueId: { in: filter.queueIds },
    ...(filter.startDate || filter.endDate ? { createdAt: createdAtFilter } : {}),
  };

  const [statusGroups, waitingTokens, currentlyServing, waitingAgg, serviceAgg] = await Promise.all(
    [
      prisma.token.groupBy({
        by: ["status"],
        where: cohortWhere,
        _count: { _all: true },
      }),
      prisma.token.count({
        where: { queueId: { in: filter.queueIds }, status: "WAITING" },
      }),
      prisma.token.count({
        where: { queueId: { in: filter.queueIds }, status: "IN_SERVICE" },
      }),
      prisma.$queryRaw<AverageRow[]>(Prisma.sql`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (t."service_started_at" - t."created_at"))))::int AS average
      FROM "tokens" t
      WHERE ${queueScope(filter.queueIds, "t")}
        AND t."service_started_at" IS NOT NULL
        AND t."status" <> 'CANCELLED'::"TokenStatus"
        ${timestampCondition("t", "service_started_at", filter)}
    `),
      prisma.$queryRaw<AverageRow[]>(Prisma.sql`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (t."service_completed_at" - t."service_started_at"))))::int AS average
      FROM "tokens" t
      WHERE ${queueScope(filter.queueIds, "t")}
        AND t."status" = 'COMPLETED'::"TokenStatus"
        AND t."service_started_at" IS NOT NULL
        AND t."service_completed_at" IS NOT NULL
        ${timestampCondition("t", "service_completed_at", filter)}
    `),
    ],
  );

  const counts = new Map<TokenStatus, number>();
  for (const group of statusGroups) {
    counts.set(group.status, group._count._all);
  }

  const totalTokens = statusGroups.reduce((total, group) => total + group._count._all, 0);
  const completedTokens = counts.get("COMPLETED") ?? 0;
  const cancelledTokens = counts.get("CANCELLED") ?? 0;

  return {
    totalQueues: filter.queues.length,
    activeQueues: filter.queues.filter((queue) => queue.status === "ACTIVE").length,
    totalTokens,
    waitingTokens,
    currentlyServing,
    completedTokens,
    cancelledTokens,
    averageWaitingTime: waitingAgg[0]?.average ?? null,
    averageServiceDuration: serviceAgg[0]?.average ?? null,
    completionRate: rate(completedTokens, totalTokens),
    cancellationRate: rate(cancelledTokens, totalTokens),
    unit: "seconds",
    semantics: {
      live: ["waitingTokens", "currentlyServing", "totalQueues", "activeQueues"],
      historical: [
        "totalTokens",
        "completedTokens",
        "cancelledTokens",
        "averageWaitingTime",
        "averageServiceDuration",
      ],
      timezone: filter.timezone,
      ...rangeMeta(filter),
    },
  };
}

interface TrendRow {
  bucket: Date;
  waitingCount: number;
}

/** Chooses a useful interval when the caller does not provide one. */
function chooseTrendInterval(
  requested: TrendInterval | null | undefined,
  startDate: Date,
  endDate: Date,
): TrendInterval {
  if (requested === "daily") {
    return "daily";
  }

  const rangeDays = (endDate.getTime() - startDate.getTime()) / (SECONDS_PER_DAY * 1000);

  if (requested === "hourly") {
    // Hourly points over a very long range are noisy and expensive. Fall back
    // to daily rather than making the dashboard time out.
    return rangeDays > MAX_HOURLY_RANGE_DAYS ? "daily" : "hourly";
  }

  return rangeDays <= 2 ? "hourly" : "daily";
}

export async function getQueueLengthTrends(
  managerId: string,
  query: AnalyticsTrendsQuery,
): Promise<TrendsResponse> {
  const filter = await resolveFilter(managerId, query);
  const endDate = filter.endDate ?? new Date();
  let startDate = filter.startDate;

  if (!startDate) {
    const earliestQueue = filter.queues[0]?.createdAt ?? null;
    const earliestActivity =
      filter.queueIds.length > 0
        ? await prisma.queueActivity.findFirst({
            where: { queueId: { in: filter.queueIds } },
            select: { createdAt: true },
            orderBy: { createdAt: "asc" },
          })
        : null;

    const anchors = [earliestQueue, earliestActivity?.createdAt ?? null].filter(
      (value): value is Date => value !== null,
    );
    const anchor =
      anchors.length > 0
        ? new Date(Math.min(...anchors.map((value) => value.getTime())))
        : new Date(endDate.getTime() - DEFAULT_TREND_DAYS * SECONDS_PER_DAY * 1000);

    startDate = anchor;
  }

  if (startDate.getTime() > endDate.getTime()) {
    startDate = new Date(endDate.getTime() - DEFAULT_TREND_DAYS * SECONDS_PER_DAY * 1000);
  }

  const interval = chooseTrendInterval(query.interval, startDate, endDate);

  if (filter.queueIds.length === 0) {
    return {
      data: [],
      meta: {
        interval,
        requestedInterval: query.interval ?? null,
        timezone: filter.timezone,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        peakWaitingCount: 0,
        averageWaitingCount: 0,
        totalIntervals: 0,
        queueIds: [],
      },
    };
  }

  const unit = interval === "hourly" ? "hour" : "day";
  const step = interval === "hourly" ? "1 hour" : "1 day";

  const rows = await prisma.$queryRaw<TrendRow[]>(Prisma.sql`
    WITH bounds AS (
      SELECT ${startDate}::timestamptz AS starts_at, ${endDate}::timestamptz AS ends_at
    ),
    buckets AS (
      SELECT generate_series(
        date_trunc(${Prisma.raw(`'${unit}'`)}, starts_at AT TIME ZONE ${filter.timezone}),
        date_trunc(${Prisma.raw(`'${unit}'`)}, ends_at AT TIME ZONE ${filter.timezone}),
        ${Prisma.raw(`'${step}'`)}
      ) AT TIME ZONE ${filter.timezone} AS bucket
      FROM bounds
    ),
    deltas AS (
      SELECT
        date_trunc(${Prisma.raw(`'${unit}'`)}, a."created_at" AT TIME ZONE ${filter.timezone})
          AT TIME ZONE ${filter.timezone} AS bucket,
        SUM(
          CASE a."event_type"
            WHEN 'TOKEN_CREATED' THEN 1
            WHEN 'SERVICE_STARTED' THEN -1
            WHEN 'TOKEN_CANCELLED' THEN -1
            ELSE 0
          END
        )::int AS delta
      FROM "queue_activities" a
      WHERE ${activityQueueScope(filter.queueIds, "a")}
        AND a."created_at" >= (SELECT starts_at FROM bounds)
        AND a."created_at" <= (SELECT ends_at FROM bounds)
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
      WHERE ${activityQueueScope(filter.queueIds, "a")}
        AND a."created_at" < (SELECT starts_at FROM bounds)
    )
    SELECT
      b.bucket AS bucket,
      ((SELECT count FROM baseline) + COALESCE(SUM(d.delta) OVER (ORDER BY b.bucket), 0))::int
        AS "waitingCount"
    FROM buckets b
    LEFT JOIN deltas d ON d.bucket = b.bucket
    ORDER BY b.bucket ASC
  `);

  const data = rows.map((row) => ({
    timestamp: row.bucket.toISOString(),
    waitingCount: Number(row.waitingCount),
  }));

  const peakWaitingCount = data.reduce((peak, point) => Math.max(peak, point.waitingCount), 0);
  const averageWaitingCount =
    data.length > 0
      ? Math.round(data.reduce((total, point) => total + point.waitingCount, 0) / data.length)
      : 0;

  return {
    data,
    meta: {
      interval,
      requestedInterval: query.interval ?? null,
      timezone: filter.timezone,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      peakWaitingCount,
      averageWaitingCount,
      totalIntervals: data.length,
      queueIds: filter.queueIds,
    },
  };
}

interface WaitAggregateRow {
  sampleSize: number;
  average: number | null;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
}

interface WaitStatusRow extends WaitAggregateRow {
  status: "COMPLETED" | "IN_SERVICE";
}

interface DistributionRow {
  under5m: number;
  under10m: number;
  under20m: number;
  under30m: number;
  under60m: number;
  over60m: number;
}

interface DailyWaitRow {
  date: string;
  count: number;
  average: number | null;
}

export async function getWaitTimes(
  managerId: string,
  query: AnalyticsQuery,
): Promise<WaitTimesResponse> {
  const filter = await resolveFilter(managerId, query);

  if (filter.queueIds.length === 0) {
    return {
      ...emptyDurationMetrics(),
      unit: "seconds",
      byStatus: { completed: emptyDurationMetrics(), inService: emptyDurationMetrics() },
      distribution: [],
      daily: [],
      timezone: filter.timezone,
      range: rangeMeta(filter),
    };
  }

  const baseWhere = Prisma.sql`
    ${queueScope(filter.queueIds, "t")}
      AND t."service_started_at" IS NOT NULL
      AND t."status" IN ('IN_SERVICE'::"TokenStatus", 'COMPLETED'::"TokenStatus")
      ${timestampCondition("t", "service_started_at", filter)}
  `;
  const waitSeconds = Prisma.raw(`EXTRACT(EPOCH FROM (t."service_started_at" - t."created_at"))`);

  const [aggregateRows, statusRows, distributionRows, dailyRows] = await Promise.all([
    prisma.$queryRaw<WaitAggregateRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS "sampleSize",
        ROUND(AVG(${waitSeconds}))::int AS average,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${waitSeconds}))::int AS median,
        ROUND(MIN(${waitSeconds}))::int AS minimum,
        ROUND(MAX(${waitSeconds}))::int AS maximum
      FROM "tokens" t
      WHERE ${baseWhere}
    `),
    prisma.$queryRaw<WaitStatusRow[]>(Prisma.sql`
      SELECT
        t."status"::text AS status,
        COUNT(*)::int AS "sampleSize",
        ROUND(AVG(${waitSeconds}))::int AS average,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${waitSeconds}))::int AS median,
        ROUND(MIN(${waitSeconds}))::int AS minimum,
        ROUND(MAX(${waitSeconds}))::int AS maximum
      FROM "tokens" t
      WHERE ${baseWhere}
      GROUP BY t."status"
    `),
    prisma.$queryRaw<DistributionRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE wait_seconds < 300)::int AS "under5m",
        COUNT(*) FILTER (WHERE wait_seconds >= 300 AND wait_seconds < 600)::int AS "under10m",
        COUNT(*) FILTER (WHERE wait_seconds >= 600 AND wait_seconds < 1200)::int AS "under20m",
        COUNT(*) FILTER (WHERE wait_seconds >= 1200 AND wait_seconds < 1800)::int AS "under30m",
        COUNT(*) FILTER (WHERE wait_seconds >= 1800 AND wait_seconds < 3600)::int AS "under60m",
        COUNT(*) FILTER (WHERE wait_seconds >= 3600)::int AS "over60m"
      FROM (
        SELECT ${waitSeconds} AS wait_seconds
        FROM "tokens" t
        WHERE ${baseWhere}
      ) waits
    `),
    prisma.$queryRaw<DailyWaitRow[]>(Prisma.sql`
      SELECT
        to_char(t."service_started_at" AT TIME ZONE ${filter.timezone}, 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count,
        ROUND(AVG(${waitSeconds}))::int AS average
      FROM "tokens" t
      WHERE ${baseWhere}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
  ]);

  const aggregate = aggregateRows[0];
  const byStatus = {
    completed: emptyDurationMetrics(),
    inService: emptyDurationMetrics(),
  };

  for (const row of statusRows) {
    const metrics: DurationMetrics = {
      sampleSize: row.sampleSize,
      average: row.average,
      median: row.median,
      minimum: row.minimum,
      maximum: row.maximum,
    };

    if (row.status === "COMPLETED") {
      byStatus.completed = metrics;
    } else {
      byStatus.inService = metrics;
    }
  }

  const distributionRow = distributionRows[0];

  return {
    sampleSize: aggregate?.sampleSize ?? 0,
    average: aggregate?.average ?? null,
    median: aggregate?.median ?? null,
    minimum: aggregate?.minimum ?? null,
    maximum: aggregate?.maximum ?? null,
    unit: "seconds",
    byStatus,
    distribution: distributionRow
      ? [
          { label: "0–5 min", count: distributionRow.under5m },
          { label: "5–10 min", count: distributionRow.under10m },
          { label: "10–20 min", count: distributionRow.under20m },
          { label: "20–30 min", count: distributionRow.under30m },
          { label: "30–60 min", count: distributionRow.under60m },
          { label: "60+ min", count: distributionRow.over60m },
        ]
      : [],
    daily: dailyRows,
    timezone: filter.timezone,
    range: rangeMeta(filter),
  };
}

interface ServiceAggregateRow {
  totalCompleted: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
}

interface DailyServiceRow {
  date: string;
  completed: number;
  average: number | null;
}

export async function getServicePerformance(
  managerId: string,
  query: AnalyticsQuery,
): Promise<ServicePerformanceResponse> {
  const filter = await resolveFilter(managerId, query);

  if (filter.queueIds.length === 0) {
    return {
      totalCompleted: 0,
      totalCancelled: 0,
      average: null,
      minimum: null,
      maximum: null,
      completionRate: null,
      unit: "seconds",
      daily: [],
      timezone: filter.timezone,
      range: rangeMeta(filter),
    };
  }

  const completedWhere = Prisma.sql`
    ${queueScope(filter.queueIds, "t")}
      AND t."status" = 'COMPLETED'::"TokenStatus"
      AND t."service_started_at" IS NOT NULL
      AND t."service_completed_at" IS NOT NULL
      ${timestampCondition("t", "service_completed_at", filter)}
  `;
  const duration = Prisma.raw(
    `EXTRACT(EPOCH FROM (t."service_completed_at" - t."service_started_at"))`,
  );

  const cancelledRange =
    filter.startDate || filter.endDate
      ? timestampCondition("t", "cancelled_at", filter)
      : Prisma.sql``;

  const [aggregateRows, dailyRows, cancelledRows] = await Promise.all([
    prisma.$queryRaw<ServiceAggregateRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS "totalCompleted",
        ROUND(AVG(${duration}))::int AS average,
        ROUND(MIN(${duration}))::int AS minimum,
        ROUND(MAX(${duration}))::int AS maximum
      FROM "tokens" t
      WHERE ${completedWhere}
    `),
    prisma.$queryRaw<DailyServiceRow[]>(Prisma.sql`
      SELECT
        to_char(t."service_completed_at" AT TIME ZONE ${filter.timezone}, 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS completed,
        ROUND(AVG(${duration}))::int AS average
      FROM "tokens" t
      WHERE ${completedWhere}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
    prisma.$queryRaw<Array<{ totalCancelled: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "totalCancelled"
      FROM "tokens" t
      WHERE ${queueScope(filter.queueIds, "t")}
        AND t."status" = 'CANCELLED'::"TokenStatus"
        AND t."cancelled_at" IS NOT NULL
        ${cancelledRange}
    `),
  ]);

  const aggregate = aggregateRows[0];
  const totalCompleted = aggregate?.totalCompleted ?? 0;
  const totalCancelled = cancelledRows[0]?.totalCancelled ?? 0;
  const resolved = totalCompleted + totalCancelled;

  return {
    totalCompleted,
    totalCancelled,
    average: aggregate?.average ?? null,
    minimum: aggregate?.minimum ?? null,
    maximum: aggregate?.maximum ?? null,
    completionRate: rate(totalCompleted, resolved),
    unit: "seconds",
    daily: dailyRows,
    timezone: filter.timezone,
    range: rangeMeta(filter),
  };
}

interface DailyDistributionRow {
  date: string;
  total: number;
  completed: number;
  cancelled: number;
  waiting: number;
  inService: number;
}

export async function getTokenDistribution(
  managerId: string,
  query: AnalyticsQuery,
): Promise<TokenDistributionResponse> {
  const filter = await resolveFilter(managerId, query);

  if (filter.queueIds.length === 0) {
    return {
      total: 0,
      completed: 0,
      cancelled: 0,
      waiting: 0,
      inService: 0,
      completionRate: null,
      cancellationRate: null,
      dailyRegistrations: [],
      byQueue: [],
      timezone: filter.timezone,
      range: rangeMeta(filter),
    };
  }

  const createdAtFilter: Prisma.DateTimeFilter = {};
  if (filter.startDate) createdAtFilter.gte = filter.startDate;
  if (filter.endDate) createdAtFilter.lte = filter.endDate;

  const where = {
    queueId: { in: filter.queueIds },
    ...(filter.startDate || filter.endDate ? { createdAt: createdAtFilter } : {}),
  };

  const [groups, dailyRows] = await Promise.all([
    prisma.token.groupBy({
      by: ["queueId", "status"],
      where,
      _count: { _all: true },
    }),
    prisma.$queryRaw<DailyDistributionRow[]>(Prisma.sql`
      SELECT
        to_char(t."created_at" AT TIME ZONE ${filter.timezone}, 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE t."status" = 'COMPLETED'::"TokenStatus")::int AS completed,
        COUNT(*) FILTER (WHERE t."status" = 'CANCELLED'::"TokenStatus")::int AS cancelled,
        COUNT(*) FILTER (WHERE t."status" = 'WAITING'::"TokenStatus")::int AS waiting,
        COUNT(*) FILTER (WHERE t."status" = 'IN_SERVICE'::"TokenStatus")::int AS "inService"
      FROM "tokens" t
      WHERE ${queueScope(filter.queueIds, "t")}
        ${timestampCondition("t", "created_at", filter)}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
  ]);

  const counts = new Map<string, Map<TokenStatus, number>>();
  for (const queue of filter.queues) {
    counts.set(queue.id, new Map());
  }

  for (const group of groups) {
    const queueCounts = counts.get(group.queueId);
    if (queueCounts) {
      queueCounts.set(group.status, group._count._all);
    }
  }

  const byQueue: QueueDistribution[] = filter.queues.map((queue) => {
    const queueCounts = counts.get(queue.id) ?? new Map<TokenStatus, number>();
    const total = [...queueCounts.values()].reduce((sum, value) => sum + value, 0);
    const completed = queueCounts.get("COMPLETED") ?? 0;
    const cancelled = queueCounts.get("CANCELLED") ?? 0;

    return {
      queueId: queue.id,
      name: queue.name,
      code: queue.code,
      total,
      completed,
      cancelled,
      waiting: queueCounts.get("WAITING") ?? 0,
      inService: queueCounts.get("IN_SERVICE") ?? 0,
      completionRate: rate(completed, total),
      cancellationRate: rate(cancelled, total),
    };
  });

  const totals = byQueue.reduce(
    (sum, queue) => ({
      total: sum.total + queue.total,
      completed: sum.completed + queue.completed,
      cancelled: sum.cancelled + queue.cancelled,
      waiting: sum.waiting + queue.waiting,
      inService: sum.inService + queue.inService,
    }),
    { total: 0, completed: 0, cancelled: 0, waiting: 0, inService: 0 },
  );

  return {
    ...totals,
    completionRate: rate(totals.completed, totals.total),
    cancellationRate: rate(totals.cancelled, totals.total),
    dailyRegistrations: dailyRows,
    byQueue,
    timezone: filter.timezone,
    range: rangeMeta(filter),
  };
}

/** Guards unusual but valid-looking queries from generating megabytes of JSON. */
export function assertReasonableTrendRange(startDate?: Date, endDate?: Date): void {
  if (!startDate) {
    return;
  }

  // An omitted end date means "up to now", so the guard must still apply.
  const resolvedEnd = endDate ?? new Date();
  const days = (resolvedEnd.getTime() - startDate.getTime()) / (SECONDS_PER_DAY * 1000);

  if (days > 3650) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Trend ranges are limited to ten years. Narrow the date range and try again.",
    );
  }
}
