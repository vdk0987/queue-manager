import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { findManagerById } from "../modules/auth/auth.service.js";
import { verifySessionToken } from "../modules/auth/auth.tokens.js";
import type { PublicManager } from "../modules/auth/auth.types.js";

function readSessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[env.cookie.name];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }

  const authorization = req.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const bearerToken = authorization.slice("Bearer ".length).trim();
    if (bearerToken.length > 0) {
      return bearerToken;
    }
  }

  return null;
}

/**
 * Authenticates a request from the HttpOnly session cookie (preferred) or an
 * Authorization bearer token (useful for scripts and API clients).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readSessionToken(req);

    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    const payload = verifySessionToken(token);
    const manager = await findManagerById(payload.sub);

    if (!manager) {
      throw new AppError(401, "UNAUTHORIZED", "This account no longer exists.");
    }

    req.manager = manager;
    next();
  } catch (error) {
    next(error);
  }
}

/** Returns the authenticated manager or throws if the auth middleware did not run. */
export function getAuthenticatedManager(req: Request): PublicManager {
  if (!req.manager) {
    throw new AppError(401, "UNAUTHORIZED", "Please sign in to continue.");
  }

  return req.manager;
}
