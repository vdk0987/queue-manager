import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageLoader } from "@/components/brand/full-page-loader";
import { getSafeRedirect, type RedirectLocation } from "@/lib/navigation";
import { useAuth } from "@/providers/auth-provider";

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <FullPageLoader />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();
  const state = location.state as { from?: RedirectLocation } | null;

  if (status === "loading") {
    return <FullPageLoader />;
  }

  if (status === "authenticated") {
    return <Navigate to={getSafeRedirect(state?.from)} replace />;
  }

  return <Outlet />;
}
