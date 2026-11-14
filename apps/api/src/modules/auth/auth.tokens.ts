import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

const TOKEN_ISSUER = "queuepilot-api";
const TOKEN_AUDIENCE = "queuepilot-web";

export interface SessionPayload extends JwtPayload {
  sub: string;
  type: "manager";
}

export function createSessionToken(managerId: string): string {
  return jwt.sign({ type: "manager" }, env.jwtSecret, {
    subject: managerId,
    expiresIn: `${env.sessionTtlDays}d` as SignOptions["expiresIn"],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });
}

export function verifySessionToken(token: string): SessionPayload {
  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    if (
      typeof payload === "string" ||
      payload.type !== "manager" ||
      typeof payload.sub !== "string" ||
      payload.sub.length === 0
    ) {
      throw new Error("Malformed session token payload.");
    }

    return payload as SessionPayload;
  } catch {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Your session is invalid or has expired. Please sign in again.",
    );
  }
}
