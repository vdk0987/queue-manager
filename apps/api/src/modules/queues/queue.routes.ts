import { Router } from "express";
import { validateBody, validateParams } from "../../lib/validation.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  createQueueHandler,
  getQueueHandler,
  listQueuesHandler,
  updateQueueHandler,
  updateQueueStatusHandler,
} from "./queue.controller.js";
import {
  createQueueSchema,
  queueIdParamsSchema,
  updateQueueSchema,
  updateQueueStatusSchema,
} from "./queue.schemas.js";

export const queueRouter = Router();

// Queue data is private to the authenticated manager.
queueRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

queueRouter.use(requireAuth);

queueRouter.post("/", validateBody(createQueueSchema), createQueueHandler);
queueRouter.get("/", listQueuesHandler);
queueRouter.get("/:id", validateParams(queueIdParamsSchema), getQueueHandler);
queueRouter.patch(
  "/:id/status",
  validateParams(queueIdParamsSchema),
  validateBody(updateQueueStatusSchema),
  updateQueueStatusHandler,
);
queueRouter.patch(
  "/:id",
  validateParams(queueIdParamsSchema),
  validateBody(updateQueueSchema),
  updateQueueHandler,
);
