import { Router } from "express";
import { validateBody, validateParams } from "../../lib/validation.js";
import { requireAuth } from "../../middleware/auth.js";
import { cancelTokenHandler, getTokenHandler, reorderTokenHandler } from "./token.controller.js";
import { reorderTokenSchema, tokenIdParamsSchema } from "./token.schemas.js";

export const tokenRouter = Router();

// Token data is private to the authenticated manager.
tokenRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

tokenRouter.use(requireAuth);

tokenRouter.get("/:id", validateParams(tokenIdParamsSchema), getTokenHandler);
tokenRouter.patch(
  "/:id/reorder",
  validateParams(tokenIdParamsSchema),
  validateBody(reorderTokenSchema),
  reorderTokenHandler,
);
tokenRouter.post("/:id/cancel", validateParams(tokenIdParamsSchema), cancelTokenHandler);
