import type { Request, Response } from "express";
import { z, type ZodType } from "zod";
import { AppError } from "../../lib/errors.js";
import { getAuthenticatedManager } from "../../middleware/auth.js";
import {
  analyticsQuerySchema,
  analyticsDashboardQuerySchema,
  analyticsTrendsQuerySchema,
  type AnalyticsQuery,
  type AnalyticsDashboardQuery,
  type AnalyticsTrendsQuery,
} from "./analytics.schemas.js";
import { getAnalyticsDashboard } from "./analytics.dashboard.service.js";
import {
  assertReasonableTrendRange,
  getOverview,
  getQueueLengthTrends,
  getServicePerformance,
  getTokenDistribution,
  getWaitTimes,
} from "./analytics.service.js";

function readQuery<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(req.query);

  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Some filters need your attention.", {
      fieldErrors: z.flattenError(result.error).fieldErrors,
    });
  }

  return result.data;
}

export async function overviewHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const data = await getOverview(manager.id, readQuery<AnalyticsQuery>(req, analyticsQuerySchema));

  res.status(200).json({ success: true, data });
}

export async function dashboardHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const data = await getAnalyticsDashboard(
    manager.id,
    readQuery<AnalyticsDashboardQuery>(req, analyticsDashboardQuerySchema),
  );

  res.status(200).json({ success: true, data });
}

export async function trendsHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const query = readQuery<AnalyticsTrendsQuery>(req, analyticsTrendsQuerySchema);

  assertReasonableTrendRange(query.startDate, query.endDate);

  const data = await getQueueLengthTrends(manager.id, query);

  res.status(200).json({ success: true, data: data.data, meta: data.meta });
}

export async function waitTimesHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const data = await getWaitTimes(manager.id, readQuery<AnalyticsQuery>(req, analyticsQuerySchema));

  res.status(200).json({ success: true, data });
}

export async function servicePerformanceHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const data = await getServicePerformance(
    manager.id,
    readQuery<AnalyticsQuery>(req, analyticsQuerySchema),
  );

  res.status(200).json({ success: true, data });
}

export async function tokenDistributionHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const data = await getTokenDistribution(
    manager.id,
    readQuery<AnalyticsQuery>(req, analyticsQuerySchema),
  );

  res.status(200).json({ success: true, data });
}
