import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Defence-in-depth CSRF protection for cookie-authenticated mutations.
 * Browsers attach an Origin header to cross-site state-changing requests; if it
 * is present and not allow-listed, the request is rejected before it reaches a
 * controller. Non-browser clients without an Origin header remain unaffected.
 */
export function originGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");

  if (origin && !env.clientOrigins.includes(origin)) {
    next(new AppError(403, "FORBIDDEN", "This request origin is not allowed."));
    return;
  }

  next();
}
