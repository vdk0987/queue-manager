import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    const body: ErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    };
    res.status(error.statusCode).json(body);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Some fields need your attention.",
        details: { fieldErrors: z.flattenError(error).fieldErrors },
      },
    } satisfies ErrorBody);
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({
        error: {
          code: "EMAIL_TAKEN",
          message: "An account with this email address already exists.",
        },
      } satisfies ErrorBody);
      return;
    }

    if (error.code === "P2025") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "The requested record was not found." },
      } satisfies ErrorBody);
      return;
    }
  }

  if (
    error instanceof SyntaxError &&
    "status" in error &&
    "body" in error &&
    (error as SyntaxError & { status: number }).status === 400
  ) {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "The request body contains invalid JSON." },
    } satisfies ErrorBody);
    return;
  }

  if (error instanceof Error && "type" in error && error.type === "entity.too.large") {
    res.status(413).json({
      error: { code: "VALIDATION_ERROR", message: "The request body is too large." },
    } satisfies ErrorBody);
    return;
  }

  console.error(`[api] Unhandled error on ${req.method} ${req.originalUrl}:`, error);

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our side. Please try again.",
      ...(env.isProduction ? {} : { details: error instanceof Error ? error.message : undefined }),
    },
  } satisfies ErrorBody);
}
