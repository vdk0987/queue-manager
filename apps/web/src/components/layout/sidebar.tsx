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
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
