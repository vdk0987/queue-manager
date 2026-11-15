import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { attachRealtimeServer } from "./realtime.js";

let server: ReturnType<typeof createServer> | undefined;
let shuttingDown = false;

async function start(): Promise<void> {
  await prisma.$connect();

  server = createServer(app);
  attachRealtimeServer(server);
  server.listen(env.port, () => {
    console.log(`\n  QueuePilot API ready on http://localhost:${env.port}`);
    console.log(`  Environment: ${env.nodeEnv}`);
    console.log(`  Allowed origins: ${env.clientOrigins.join(", ")}\n`);
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`\n[api] ${signal} received — shutting down gracefully.`);

  const forceExit = setTimeout(() => {
    console.error("[api] Graceful shutdown timed out.");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
  }

  server.close(async (error) => {
    await prisma.$disconnect();

    if (error) {
      console.error("[api] Error while closing the server:", error);
      process.exit(1);
    }

    console.log("[api] Shutdown complete.");
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("[api] Unhandled promise rejection:", reason);
});

start().catch(async (error) => {
  console.error("[api] Failed to start:", error);
  await prisma.$disconnect();
  process.exit(1);
});
