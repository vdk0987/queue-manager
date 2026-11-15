import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { getAuthenticatedManager } from "../../middleware/auth.js";
import { emitQueueEvent } from "../../realtime.js";
import type { CreateTokenInput, ReorderTokenInput } from "./token.schemas.js";
import { queueHistoryQuerySchema, queueTokenQuerySchema } from "./token.schemas.js";
import {
  cancelToken,
  completeToken,
  getCurrentToken,
  getToken,
  listQueueHistory,
  listQueueTokens,
  nextToken,
  registerToken,
  reorderToken,
} from "./token.service.js";

function readParam(req: Request, name: "id"): string {
  const value = req.params[name];

  if (typeof value !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "The request contains an invalid identifier.");
  }

  return value;
}

function readStatusFilter(req: Request) {
  const result = queueTokenQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Some filters need your attention.", {
      fieldErrors: z.flattenError(result.error).fieldErrors,
    });
  }

  return result.data.status;
}

function readHistoryQuery(req: Request) {
  const result = queueHistoryQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Some filters need your attention.", {
      fieldErrors: z.flattenError(result.error).fieldErrors,
    });
  }

  return result.data;
}

export async function registerTokenHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const token = await registerToken(manager.id, readParam(req, "id"), req.body as CreateTokenInput);
  emitQueueEvent("token:created", { queueId: token.queueId, token }, manager.id);

  res.status(201).json({ success: true, data: token });
}

export async function listQueueTokensHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const result = await listQueueTokens(manager.id, readParam(req, "id"), readStatusFilter(req));

  res.status(200).json({ success: true, data: result });
}

export async function getTokenHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const token = await getToken(manager.id, readParam(req, "id"));

  res.status(200).json({ success: true, data: token });
}

export async function reorderTokenHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const { direction } = req.body as ReorderTokenInput;
  const result = await reorderToken(manager.id, readParam(req, "id"), direction);
  emitQueueEvent(
    "token:reordered",
    { queueId: result.token.queueId, token: result.token },
    manager.id,
  );

  res.status(200).json({ success: true, data: result });
}

export async function cancelTokenHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const result = await cancelToken(manager.id, readParam(req, "id"));
  emitQueueEvent(
    "token:cancelled",
    { queueId: result.token.queueId, token: result.token },
    manager.id,
  );

  res.status(200).json({
    success: true,
    message: "Token cancelled successfully",
    data: result,
  });
}

export async function nextTokenHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const token = await nextToken(manager.id, readParam(req, "id"));
  emitQueueEvent("service:started", { queueId: token.queueId, token }, manager.id);

  res.status(200).json({ success: true, data: token });
}

export async function getCurrentTokenHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const token = await getCurrentToken(manager.id, readParam(req, "id"));

  res.status(200).json({ success: true, data: token });
}

export async function completeTokenHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const token = await completeToken(manager.id, readParam(req, "id"));
  emitQueueEvent("service:completed", { queueId: token.queueId, token }, manager.id);

  res.status(200).json({
    success: true,
    message: "Service completed successfully",
    data: token,
  });
}

export async function listQueueHistoryHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const result = await listQueueHistory(manager.id, readParam(req, "id"), readHistoryQuery(req));

  res.status(200).json({ success: true, data: result });
}
