import type {
  AuthResponse,
  HealthResponse,
  LoginInput,
  Manager,
  RegisterInput,
} from "@/types/auth";
import type {
  CreateQueueInput,
  Queue,
  QueueApiResponse,
  QueueStatus,
  UpdateQueueInput,
} from "@/types/queue";
import type {
  CancelTokenData,
  HistoryStatusFilter,
  QueueHistoryData,
  QueueTokensData,
  RegisterParticipantInput,
  ReorderTokenData,
  Token,
  TokenApiResponse,
  TokenFilterStatus,
} from "@/types/token";

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

export const queueApi = {
  list(signal?: AbortSignal): Promise<QueueApiResponse<Queue[]>> {
    return apiRequest<QueueApiResponse<Queue[]>>("/api/queues", { signal });
  },

  get(queueId: string, signal?: AbortSignal): Promise<QueueApiResponse<Queue>> {
    return apiRequest<QueueApiResponse<Queue>>(`/api/queues/${encodeURIComponent(queueId)}`, {
      signal,
    });
  },

  create(input: CreateQueueInput): Promise<QueueApiResponse<Queue>> {
    return apiRequest<QueueApiResponse<Queue>>("/api/queues", {
      method: "POST",
      body: input,
    });
  },

  rename(queueId: string, input: UpdateQueueInput): Promise<QueueApiResponse<Queue>> {
    return apiRequest<QueueApiResponse<Queue>>(`/api/queues/${encodeURIComponent(queueId)}`, {
      method: "PATCH",
      body: input,
    });
  },

  updateStatus(queueId: string, status: QueueStatus): Promise<QueueApiResponse<Queue>> {
    return apiRequest<QueueApiResponse<Queue>>(
      `/api/queues/${encodeURIComponent(queueId)}/status`,
      {
        method: "PATCH",
        body: { status },
      },
    );
  },
};

export const tokenApi = {
  listForQueue(
    queueId: string,
    options: { status?: TokenFilterStatus; signal?: AbortSignal } = {},
  ): Promise<TokenApiResponse<QueueTokensData>> {
    const query = new URLSearchParams();

    if (options.status && options.status !== "ALL") {
      query.set("status", options.status);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : "";

    return apiRequest<TokenApiResponse<QueueTokensData>>(
      `/api/queues/${encodeURIComponent(queueId)}/tokens${suffix}`,
      { signal: options.signal },
    );
  },

  get(tokenId: string, signal?: AbortSignal): Promise<TokenApiResponse<Token>> {
    return apiRequest<TokenApiResponse<Token>>(`/api/tokens/${encodeURIComponent(tokenId)}`, {
      signal,
    });
  },

  register(queueId: string, input: RegisterParticipantInput): Promise<TokenApiResponse<Token>> {
    return apiRequest<TokenApiResponse<Token>>(
      `/api/queues/${encodeURIComponent(queueId)}/tokens`,
      {
        method: "POST",
        body: input,
      },
    );
  },

  reorder(
    tokenId: string,
    input: { direction: "UP" | "DOWN" },
  ): Promise<TokenApiResponse<ReorderTokenData>> {
    return apiRequest<TokenApiResponse<ReorderTokenData>>(
      `/api/tokens/${encodeURIComponent(tokenId)}/reorder`,
      {
        method: "PATCH",
        body: input,
      },
    );
  },

  cancel(tokenId: string): Promise<{
    success: true;
    message: string;
    data: CancelTokenData;
  }> {
    return apiRequest<{
      success: true;
      message: string;
      data: CancelTokenData;
    }>(`/api/tokens/${encodeURIComponent(tokenId)}/cancel`, {
      method: "POST",
    });
  },

  next(queueId: string): Promise<TokenApiResponse<Token>> {
    return apiRequest<TokenApiResponse<Token>>(`/api/queues/${encodeURIComponent(queueId)}/next`, {
      method: "POST",
    });
  },

  current(queueId: string, signal?: AbortSignal): Promise<TokenApiResponse<Token | null>> {
    return apiRequest<TokenApiResponse<Token | null>>(
      `/api/queues/${encodeURIComponent(queueId)}/current`,
      { signal },
    );
  },

  complete(tokenId: string): Promise<{
    success: true;
    message: string;
    data: Token;
  }> {
    return apiRequest<{
      success: true;
      message: string;
      data: Token;
    }>(`/api/tokens/${encodeURIComponent(tokenId)}/complete`, {
      method: "POST",
    });
  },

  history(
    queueId: string,
    options: {
      status?: HistoryStatusFilter;
      page?: number;
      limit?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<TokenApiResponse<QueueHistoryData>> {
    const query = new URLSearchParams();

    if (options.status && options.status !== "ALL") {
      query.set("status", options.status);
    }

    if (options.page) {
      query.set("page", String(options.page));
    }

    if (options.limit) {
      query.set("limit", String(options.limit));
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : "";

    return apiRequest<TokenApiResponse<QueueHistoryData>>(
      `/api/queues/${encodeURIComponent(queueId)}/history${suffix}`,
      { signal: options.signal },
    );
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
