import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import {
  overviewHandler,
  dashboardHandler,
  servicePerformanceHandler,
  tokenDistributionHandler,
  trendsHandler,
  waitTimesHandler,
} from "./analytics.controller.js";

export const analyticsRouter = Router();

// Analytics is private to the authenticated manager; never cache it at a proxy.
analyticsRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

analyticsRouter.use(requireAuth);

analyticsRouter.get("/overview", overviewHandler);
analyticsRouter.get("/dashboard", dashboardHandler);
analyticsRouter.get("/trends", trendsHandler);
analyticsRouter.get("/wait-times", waitTimesHandler);
analyticsRouter.get("/service-performance", servicePerformanceHandler);
analyticsRouter.get("/token-distribution", tokenDistributionHandler);
