import { ChevronDown, LogOut, Menu, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

interface TopbarProps {
  onOpenSidebar: () => void;
  pageTitle: string;
}

export function Topbar({ onOpenSidebar, pageTitle }: TopbarProps) {
  const { manager, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success("You've been signed out.");
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
        >
          <Menu />
        </Button>

        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground sm:inline">Workspace</span>
          <span className="hidden text-border sm:inline">/</span>
          <span className="truncate font-medium text-foreground">{pageTitle}</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Badge variant="outline" className="hidden bg-card/80 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Phase 2 · Live
        </Badge>

        <div className="hidden h-5 w-px bg-border sm:block" />

        {manager ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none"
                aria-label="Open account menu"
              >
                <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[0.6875rem] font-semibold text-white shadow-sm">
                  {getInitials(manager.name)}
                </span>
                <span className="hidden max-w-[9rem] truncate text-sm font-medium sm:inline">
                  {manager.name}
                </span>
                <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[15rem]">
              <DropdownMenuLabel className="px-2.5 py-2">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {manager.name}
                </span>
                <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                  {manager.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                Secure session active
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void handleLogout()}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
