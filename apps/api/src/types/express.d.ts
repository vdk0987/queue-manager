import type { PublicManager } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      manager?: PublicManager;
    }
  }
}

export {};
