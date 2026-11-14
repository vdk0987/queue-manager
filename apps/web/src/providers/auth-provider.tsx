import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "@/lib/api";
import type { LoginInput, Manager, RegisterInput } from "@/types/auth";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  manager: Manager | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<Manager>;
  register: (input: RegisterInput) => Promise<Manager>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [manager, setManager] = useState<Manager | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    authApi
      .me(controller.signal)
      .then(({ manager: currentManager }) => {
        if (!active) return;
        setManager(currentManager);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setManager(null);
        setStatus("unauthenticated");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { manager: currentManager } = await authApi.login(input);
    setManager(currentManager);
    setStatus("authenticated");
    return currentManager;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { manager: currentManager } = await authApi.register(input);
    setManager(currentManager);
    setStatus("authenticated");
    return currentManager;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Clearing local auth state still signs the user out of this tab even if
      // the network request fails; the cookie will expire on its own.
    } finally {
      setManager(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ manager, status, login, register, logout }),
    [manager, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }

  return context;
}
