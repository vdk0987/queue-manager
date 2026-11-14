import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { MobileSidebar } from "./mobile-sidebar";
import { getPageTitle } from "./nav-items";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lifted focus:outline-none"
      >
        Skip to content
      </a>

      <Sidebar className="fixed inset-y-0 left-0 z-40 hidden w-[272px] border-r border-border/70 lg:flex" />
      <MobileSidebar open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

      <div className="flex min-h-svh flex-col lg:pl-[272px]">
        <Topbar onOpenSidebar={() => setMobileNavOpen(true)} pageTitle={pageTitle} />

        <main id="main-content" className="relative flex-1">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.06),transparent_60%)]"
          />
          <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-border/60 px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-1.5 text-[0.6875rem] text-muted-foreground sm:flex-row">
            <span>© {new Date().getFullYear()} QueuePilot · Manager workspace</span>
            <span className="font-medium uppercase tracking-[0.1em]">
              Phase 2 · Queue management
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
