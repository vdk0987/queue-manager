import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { findManagerById } from "./modules/auth/auth.service.js";
import { verifySessionToken } from "./modules/auth/auth.tokens.js";
import { prisma } from "./lib/prisma.js";

export type RealtimeEvent =
  | "token:created"
  | "token:reordered"
  | "token:cancelled"
  | "service:started"
  | "service:completed"
  | "queue:updated";

interface RealtimePayload {
  queueId: string;
  [key: string]: unknown;
}

let io: Server | null = null;

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

export function attachRealtimeServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const cookieToken = readCookie(socket.handshake.headers.cookie, env.cookie.name);
      const bearerToken =
        typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
      const token = cookieToken ?? bearerToken;

      if (!token) {
        next(new Error("UNAUTHORIZED"));
        return;
      }

      const manager = await findManagerById(verifySessionToken(token).sub);
      if (!manager) {
        next(new Error("UNAUTHORIZED"));
        return;
      }

      socket.data.managerId = manager.id;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("queue:join", async (queueId: unknown, acknowledge?: (result: unknown) => void) => {
      if (typeof queueId !== "string") {
        acknowledge?.({ ok: false, error: "INVALID_QUEUE" });
        return;
      }

      const queue = await prisma.queue.findFirst({
        where: { id: queueId, managerId: socket.data.managerId },
        select: { id: true },
      });

      if (!queue) {
        acknowledge?.({ ok: false, error: "QUEUE_NOT_FOUND" });
        return;
      }

      await socket.join(`queue:${queue.id}`);
      acknowledge?.({ ok: true });
    });

    socket.on("queue:leave", async (queueId: unknown) => {
      if (typeof queueId === "string") {
        await socket.leave(`queue:${queueId}`);
      }
    });
  });

  return io;
}

export function emitQueueEvent(
  event: RealtimeEvent,
  payload: RealtimePayload,
  managerId?: string,
): void {
  if (!io) return;

  io.to(`queue:${payload.queueId}`).emit(event, payload);
  if (managerId) {
    io.to(`manager:${managerId}`).emit(event, payload);
  }
}
