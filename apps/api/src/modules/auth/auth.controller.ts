import type { Request, Response } from "express";
import { getAuthenticatedManager } from "../../middleware/auth.js";
import { clearSessionCookie, setSessionCookie } from "./auth.cookies.js";
import { authenticateManager, registerManager } from "./auth.service.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";
import { createSessionToken } from "./auth.tokens.js";

export async function register(req: Request, res: Response): Promise<void> {
  const manager = await registerManager(req.body as RegisterInput);
  setSessionCookie(res, createSessionToken(manager.id));
  res.status(201).json({ manager });
}

export async function login(req: Request, res: Response): Promise<void> {
  const manager = await authenticateManager(req.body as LoginInput);
  setSessionCookie(res, createSessionToken(manager.id));
  res.status(200).json({ manager });
}

export function logout(_req: Request, res: Response): void {
  clearSessionCookie(res);
  res.status(200).json({ success: true });
}

export function me(req: Request, res: Response): void {
  res.status(200).json({ manager: getAuthenticatedManager(req) });
}
