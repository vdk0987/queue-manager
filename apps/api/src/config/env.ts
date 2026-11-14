import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long."),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  CLIENT_ORIGINS: z.string().default("http://localhost:5173"),
  COOKIE_NAME: z.string().min(1).default("qp_session"),
  COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
  COOKIE_SAME_SITE: z.enum(["auto", "lax", "strict", "none"]).default("auto"),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  TRUST_PROXY: z.enum(["0", "1", "true", "false"]).default("0"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");

  console.error(`\n[QueuePilot API] Invalid environment configuration:\n${issues}\n`);
  console.error("Copy apps/api/.env.example to apps/api/.env and try again.\n");
  process.exit(1);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === "production";
const isTest = raw.NODE_ENV === "test";
const secureCookie = raw.COOKIE_SECURE === "auto" ? isProduction : raw.COOKIE_SECURE === "true";
const sameSite =
  raw.COOKIE_SAME_SITE === "auto" ? (isProduction ? "none" : "lax") : raw.COOKIE_SAME_SITE;

if (sameSite === "none" && !secureCookie) {
  console.error(
    "\n[QueuePilot API] COOKIE_SAME_SITE=none requires COOKIE_SECURE=true. Check your environment.\n",
  );
  process.exit(1);
}

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  isTest,
  port: raw.PORT,
  databaseUrl: raw.DATABASE_URL,
  jwtSecret: raw.JWT_SECRET,
  sessionTtlDays: raw.SESSION_TTL_DAYS,
  sessionTtlMs: raw.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  clientOrigins: raw.CLIENT_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookie: {
    name: raw.COOKIE_NAME,
    secure: secureCookie,
    sameSite,
    domain: raw.COOKIE_DOMAIN,
    maxAgeMs: raw.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  },
  trustProxy: raw.TRUST_PROXY === "1" || raw.TRUST_PROXY === "true",
} as const;

export type AppEnv = typeof env;
