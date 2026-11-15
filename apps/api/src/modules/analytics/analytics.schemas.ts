import { z } from "zod";

const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/**
 * Timestamps are ISO instants. Date-only values are interpreted as UTC
 * midnight; the UI sends explicit local day boundaries instead.
 */
const optionalDate = z.preprocess(
  blankToUndefined,
  z.coerce.date({ message: "Enter a valid date." }).optional(),
);

const optionalQueueId = z.preprocess(
  blankToUndefined,
  z.uuid("Enter a valid queue ID.").optional(),
);

const dateRangeShape = {
  queueId: optionalQueueId,
  startDate: optionalDate,
  endDate: optionalDate,
};

export const analyticsQuerySchema = z
  .object(dateRangeShape)
  .refine(
    (query) =>
      !query.startDate || !query.endDate || query.startDate.getTime() <= query.endDate.getTime(),
    {
      message: "The start date must be on or before the end date.",
      path: ["endDate"],
    },
  );

export const analyticsTrendsQuerySchema = z
  .object({
    ...dateRangeShape,
    interval: z
      .enum(["hourly", "daily"], {
        message: "Choose an hourly or daily interval.",
      })
      .optional(),
  })
  .refine(
    (query) =>
      !query.startDate || !query.endDate || query.startDate.getTime() <= query.endDate.getTime(),
    {
      message: "The start date must be on or before the end date.",
      path: ["endDate"],
    },
  );

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsTrendsQuery = z.infer<typeof analyticsTrendsQuerySchema>;

/**
 * The combined dashboard endpoint uses named presets so the browser and API
 * agree on calendar-day boundaries. `range` is intentionally the only required
 * knob; the five focused endpoints accept explicit start/end timestamps.
 */
export const analyticsDashboardQuerySchema = z.object({
  range: z
    .enum(["today", "7d", "30d", "90d", "all"], {
      message: "Choose today, 7d, 30d, 90d or all.",
    })
    .default("7d"),
  queueId: optionalQueueId,
});

export type AnalyticsDashboardQuery = z.infer<typeof analyticsDashboardQuerySchema>;
