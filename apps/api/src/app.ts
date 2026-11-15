import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { originGuard } from "./middleware/origin-guard.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { queueRouter } from "./modules/queues/queue.routes.js";
import { tokenRouter } from "./modules/tokens/token.routes.js";

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new AppError(403, "FORBIDDEN", "This request origin is not allowed."));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
};

export const app = express();

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(originGuard);

if (!env.isTest) {
  app.use(morgan(env.isProduction ? "combined" : "dev"));
}

app.get("/", (_req, res) => {
  res.status(200).json({
    service: "queuepilot-api",
    version: "0.1.0",
    docs: "/api/health",
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/queues", queueRouter);
app.use("/api/tokens", tokenRouter);
app.use(notFoundHandler);
app.use(errorHandler);
