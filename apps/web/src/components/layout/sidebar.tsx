import { Building2 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ onNavigate, className }: SidebarProps) {
  return (
    <div className={cn("flex h-full flex-col bg-card", className)}>
      <div className="flex h-16 shrink-0 items-center border-b border-border/60 px-5">
        <Logo showTagline />
      </div>

      <div className="px-4 pb-2 pt-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-muted/45 px-3 py-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Building2 className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">Manager workspace</p>
            <p className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              Personal account
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        <p className="px-3 pb-2 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Workspace
        </p>
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.8125rem] font-medium transition-colors focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none",
                    isActive
                      ? "bg-primary/[0.08] text-primary"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground/70 group-hover:text-foreground",
                      )}
                    />
                    <span>{item.label}</span>
                    {item.phase ? (
                      <span className="ml-auto rounded-full border border-border/80 bg-background px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                        {item.phase}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-xl border border-dashed border-border/80 px-3.5 py-3">
          <p className="text-[0.6875rem] font-semibold text-foreground">Built in phases</p>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
            Queue management is live. Participants, service flow and analytics are rolling out next.
          </p>
        </div>
      </nav>

      <div className="shrink-0 p-3">
        <div className="rounded-xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/90 to-violet-50/50 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[0.6875rem] font-semibold text-foreground">Phase 2 of 7</p>
            <span className="text-[0.625rem] font-semibold text-primary">29%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100">
            <div className="h-full w-[29%] rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
          </div>
          <p className="mt-2 text-[0.625rem] leading-relaxed text-muted-foreground">
            Manager-owned queues are live and ready to use.
          </p>
        </div>
      </div>
    </div>
  );
}
