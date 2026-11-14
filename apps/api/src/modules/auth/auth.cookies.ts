import type { CookieOptions, Response } from "express";
import { env } from "../../config/env.js";

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    path: "/",
    ...(env.cookie.domain ? { domain: env.cookie.domain } : {}),
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.cookie.name, token, {
    ...baseCookieOptions(),
    maxAge: env.cookie.maxAgeMs,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.cookie.name, baseCookieOptions());
}
