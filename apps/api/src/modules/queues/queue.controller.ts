import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import { getAuthenticatedManager } from "../../middleware/auth.js";
import type {
  CreateQueueInput,
  UpdateQueueInput,
  UpdateQueueStatusInput,
} from "./queue.schemas.js";
import { createQueue, getQueue, listQueues, renameQueue, setQueueStatus } from "./queue.service.js";

/** validateParams has already checked this is a UUID; narrow the Express type. */
function readQueueId(req: Request): string {
  const { id } = req.params;

  if (typeof id !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "The request contains an invalid identifier.");
  }

  return id;
}

export async function createQueueHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const queue = await createQueue(manager.id, req.body as CreateQueueInput);

  res.status(201).json({ success: true, data: queue });
}

export async function listQueuesHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const queues = await listQueues(manager.id);

  res.status(200).json({ success: true, data: queues });
}

export async function getQueueHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const queue = await getQueue(manager.id, readQueueId(req));

  res.status(200).json({ success: true, data: queue });
}

export async function updateQueueHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const queue = await renameQueue(manager.id, readQueueId(req), req.body as UpdateQueueInput);

  res.status(200).json({ success: true, data: queue });
}

export async function updateQueueStatusHandler(req: Request, res: Response): Promise<void> {
  const manager = getAuthenticatedManager(req);
  const queue = await setQueueStatus(
    manager.id,
    readQueueId(req),
    req.body as UpdateQueueStatusInput,
  );

  res.status(200).json({ success: true, data: queue });
}
