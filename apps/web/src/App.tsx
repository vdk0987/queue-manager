import { Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { useTheme } from "@/providers/theme-provider";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/auth/route-guards";
import { AppShell } from "@/components/layout/app-shell";
import { AnalyticsPage } from "@/pages/analytics-page";
import { AuthPage } from "@/pages/auth-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { QueueDetailsPage } from "@/pages/queue-details-page";
import { QueuesPage } from "@/pages/queues-page";

export default function App() {
  const { theme } = useTheme();

  return (
    <>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<AuthPage key="login" mode="login" />} />
          <Route path="/register" element={<AuthPage key="register" mode="register" />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="queues" element={<QueuesPage />} />
            <Route path="queues/:id" element={<QueueDetailsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <Toaster
        position="bottom-right"
        theme={theme}
        richColors
        closeButton
        toastOptions={{
          style: {
            fontFamily: "var(--font-sans)",
          },
        }}
      />
    </>
  );
}
