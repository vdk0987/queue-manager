export interface Manager {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  manager: Manager;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  database: "connected" | "unavailable";
  timestamp: string;
  uptimeSeconds: number;
}
