import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";
import { AppError } from "./errors.js";

/**
 * Parses and replaces req.body with validated data. Unknown keys are stripped
 * by the individual object schemas, keeping the controllers predictable.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(
        new AppError(400, "VALIDATION_ERROR", "Some fields need your attention.", {
          fieldErrors: z.flattenError(result.error).fieldErrors,
        }),
      );
      return;
    }

    req.body = result.data;
    next();
  };
}

/** Parses and replaces route parameters, e.g. validating a UUID before querying. */
export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      next(
        new AppError(400, "VALIDATION_ERROR", "The request contains an invalid identifier.", {
          fieldErrors: z.flattenError(result.error).fieldErrors,
        }),
      );
      return;
    }

    req.params = result.data as Request["params"];
    next();
  };
}
