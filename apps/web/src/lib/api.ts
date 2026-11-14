import type {
  AuthResponse,
  HealthResponse,
  LoginInput,
  Manager,
  RegisterInput,
} from "@/types/auth";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "We couldn't reach the server. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  const text = await response.text();
  let payload: unknown = null;

  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    throw new ApiError(
      errorPayload?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      errorPayload?.error?.code,
      errorPayload?.error?.details,
    );
  }

  return payload as T;
}

export const authApi = {
  register(input: RegisterInput): Promise<AuthResponse> {
    return apiRequest<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: input,
    });
  },

  login(input: LoginInput): Promise<AuthResponse> {
    return apiRequest<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: input,
    });
  },

  logout(): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    });
  },

  me(signal?: AbortSignal): Promise<AuthResponse> {
    return apiRequest<AuthResponse>("/api/auth/me", { signal });
  },
};

export const systemApi = {
  health(signal?: AbortSignal): Promise<HealthResponse> {
    return apiRequest<HealthResponse>("/api/health", { signal });
  },
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

export function getFieldErrors(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError) || typeof error.details !== "object" || error.details === null) {
    return {};
  }

  const details = error.details as { fieldErrors?: Record<string, string[]> };
  return details.fieldErrors ?? {};
}

export type { Manager };
