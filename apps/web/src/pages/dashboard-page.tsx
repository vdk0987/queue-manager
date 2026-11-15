import {
  Activity,
  BadgeCheck,
  Check,
  Copy,
  Database,
  KeyRound,
  ListOrdered,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useQueues } from "@/hooks/use-queues";
import { useSystemHealth } from "@/hooks/use-system-health";
import { analyticsApi } from "@/lib/api";
import {
  cn,
  formatLongDate,
  formatMonthYear,
  formatDurationSeconds,
  getFirstName,
  getGreeting,
  getInitials,
} from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

const stats: Array<{
  label: string;
  icon: LucideIcon;
  tone: "indigo" | "emerald" | "amber" | "violet";
  value: (data: DashboardSummary | null, queues: number | null, waiting: number | null) => string;
}> = [
  {
    label: "Total queues",
    icon: ListOrdered,
    tone: "indigo",
    value: (_data, queues) => (queues === null ? "—" : String(queues)),
  },
  {
    label: "Waiting now",
    icon: Users,
    tone: "emerald",
    value: (_data, _queues, waiting) => (waiting === null ? "—" : String(waiting)),
  },
  {
    label: "Served today",
    icon: BadgeCheck,
    tone: "amber",
    value: (data) => (data?.completedInRange === undefined ? "—" : String(data.completedInRange)),
  },
  {
    label: "Average wait",
    icon: Activity,
    tone: "violet",
    value: (data) =>
      data?.averageWaitSeconds === undefined ? "—" : formatDurationSeconds(data.averageWaitSeconds),
  },
];

interface DashboardSummary {
  completedInRange: number;
  averageWaitSeconds: number | null;
}

const toneStyles = {
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
} as const;

export function DashboardPage() {
  useDocumentTitle("Overview");
  const { manager } = useAuth();
  const { queues, status: queueStatus } = useQueues();
  const [analytics, setAnalytics] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    analyticsApi
      .dashboard({ range: "today", signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setAnalytics({
            completedInRange: data.summary.completedInRange,
            averageWaitSeconds: data.metrics.averageWaitSeconds,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setAnalytics(null);
      });

    return () => controller.abort();
  }, []);

  if (!manager) {
    return null;
  }

  const now = new Date();
  const firstName = getFirstName(manager.name);
  const totalQueues = queueStatus === "ready" ? queues.length : null;
  const totalWaiting =
    queueStatus === "ready" ? queues.reduce((total, queue) => total + queue.waitingCount, 0) : null;
  return (
    <div className="space-y-6 sm:space-y-7">
      <header className="animate-fade-up">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {formatLongDate(now)}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-[1.9rem]">
              {getGreeting(now)}, {firstName}.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Your queues are live. Register participants, call the next person forward, and
              complete service while every record is preserved for analytics.
            </p>
          </div>

          <div className="flex w-fit flex-wrap items-center gap-2">
            <Button asChild>
              <Link to="/queues">
                <ListOrdered />
                Manage queues
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section
        aria-label="Service management overview"
        className="relative animate-fade-up overflow-hidden rounded-2xl bg-[#131226] text-white shadow-lifted [animation-delay:60ms]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(99,102,241,0.35),transparent_42%),radial-gradient(circle_at_88%_85%,rgba(16,185,129,0.2),transparent_38%)]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-auth-grid opacity-50" />

        <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <BadgeCheck />
              Service management
            </Badge>

            <h2 className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
              From the waiting line to completed service.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-indigo-100/65">
              Call the next participant, track live service duration, complete the visit and keep a
              permanent history of every completed and cancelled token.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {["Next-token assignment", "Live service timer", "Completed history"].map(
                (feature) => (
                  <span
                    key={feature}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1 text-[0.6875rem] font-medium text-indigo-100/80 backdrop-blur"
                  >
                    <Check className="size-3 text-emerald-300" />
                    {feature}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="flex items-center gap-5 lg:flex-col lg:items-end lg:gap-3">
            <ProgressRing value={100} label="Live" />
            <div className="lg:text-right">
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-white/40">
                Workspace status
              </p>
              <p className="mt-1 text-sm font-semibold text-white">Operational</p>
              <Link
                to="/queues"
                className="mt-1 inline-flex items-center text-xs font-medium text-indigo-200 underline-offset-4 hover:underline"
              >
                Manage your queues →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label="Queue metrics"
        className="grid animate-fade-up grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4 [animation-delay:110ms]"
      >
        {stats.map((stat) => {
          const value = stat.value(analytics, totalQueues, totalWaiting);

          return (
            <Card key={stat.label} className="group transition-shadow hover:shadow-lifted">
              <CardContent className="p-5 pt-6 sm:pt-7">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[0.8125rem] font-medium text-muted-foreground">{stat.label}</p>
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-xl ring-1",
                      toneStyles[stat.tone],
                    )}
                  >
                    <stat.icon className="size-[1.125rem]" />
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <p
                    className={cn(
                      "font-display text-3xl font-bold tracking-tight",
                      value === "—" ? "text-foreground/35" : "text-foreground",
                    )}
                    aria-label={value === "—" ? "No data yet" : undefined}
                  >
                    {value}
                  </p>
                </div>
                <p className="mt-2 text-[0.6875rem] text-muted-foreground">
                  Across active and inactive lines.
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <div className="grid animate-fade-up gap-4 xl:grid-cols-[1.08fr_0.92fr] [animation-delay:160ms]">
        <SystemStatusCard />
        <SessionCard
          name={manager.name}
          email={manager.email}
          managerId={manager.id}
          createdAt={manager.createdAt}
        />
      </div>

      <Card className="animate-fade-up [animation-delay:260ms]">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              A clear audit trail of queue and token actions will appear here.
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0 bg-muted/40">
            Later
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm ring-1 ring-border/60">
              <Activity className="size-5" />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">No activity feed yet</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Registrations, reorders and cancellations are already recorded on each token. Use the
              queue workspace to review registrations, service changes and completed visits.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemStatusCard() {
  const { state, data, checkedAt, refresh } = useSystemHealth();

  const isOnline = state === "online";
  const isLoading = state === "loading";

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            System status
            <span
              className={cn(
                "size-1.5 rounded-full",
                isOnline
                  ? "animate-pulse-dot bg-emerald-500"
                  : isLoading
                    ? "bg-amber-400"
                    : "bg-destructive",
              )}
            />
          </CardTitle>
          <CardDescription>Live health of the API and its database connection.</CardDescription>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isOnline ? (
            <Badge variant="success">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Operational
            </Badge>
          ) : isLoading ? (
            <Badge variant="outline">Checking…</Badge>
          ) : (
            <Badge variant="destructive">
              <span className="size-1.5 rounded-full bg-red-500" />
              Offline
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            aria-label="Refresh system status"
            disabled={isLoading}
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5">
        {isLoading ? (
          <>
            <Skeleton className="h-[3.25rem] w-full rounded-xl" />
            <Skeleton className="h-[3.25rem] w-full rounded-xl" />
            <Skeleton className="h-[3.25rem] w-full rounded-xl" />
          </>
        ) : (
          <>
            <StatusRow
              icon={Server}
              label="API service"
              value={isOnline ? "Responding" : "Unreachable"}
              detail={data?.service ?? "queuepilot-api"}
              ok={isOnline}
            />
            <StatusRow
              icon={Database}
              label="PostgreSQL database"
              value={data?.database === "connected" ? "Connected" : "Unavailable"}
              detail={data ? `Uptime ${formatUptime(data.uptimeSeconds)}` : "No response"}
              ok={data?.database === "connected"}
            />
            <StatusRow
              icon={KeyRound}
              label="Session security"
              value="HttpOnly cookie"
              detail="SameSite · origin-checked mutations"
              ok
            />
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-[0.6875rem] text-muted-foreground">
          <span>
            {checkedAt
              ? `Last checked at ${checkedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "Waiting for a response…"}
          </span>
          <span className="font-medium">Auto-refresh · 60s</span>
        </div>

        {state === "offline" ? (
          <p className="rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive">
            The API could not be reached. Make sure the backend is running on port 4000, then
            refresh.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  detail,
  ok,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/25 px-3.5 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground shadow-xs ring-1 ring-border/60">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="truncate text-[0.6875rem] text-muted-foreground">{detail}</p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 text-right text-[0.6875rem] font-semibold",
          ok ? "text-emerald-700" : "text-destructive",
        )}
      >
        <span
          className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-destructive")}
        />
        {value}
      </span>
    </div>
  );
}

function SessionCard({
  name,
  email,
  managerId,
  createdAt,
}: {
  name: string;
  email: string;
  managerId: string;
  createdAt: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyManagerId() {
    try {
      await navigator.clipboard.writeText(managerId);
      setCopied(true);
      toast.success("Manager ID copied to your clipboard.");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Clipboard access is unavailable in this browser.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account & session</CardTitle>
        <CardDescription>The identity behind this manager workspace.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-500/20">
            {getInitials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <Badge variant="success" className="ml-auto shrink-0">
            <ShieldCheck />
            Verified
          </Badge>
        </div>

        <dl className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/20 px-3.5">
          <InfoRow label="Role" value="Queue manager" />
          <InfoRow label="Member since" value={formatMonthYear(createdAt)} />
          <InfoRow label="Session" value="Secure · HttpOnly" valueClassName="text-emerald-700" />
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-[0.6875rem] font-medium text-muted-foreground">Manager ID</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              <code className="max-w-[9rem] truncate rounded bg-card px-1.5 py-0.5 font-mono text-[0.625rem] text-foreground ring-1 ring-border/60 sm:max-w-[11rem]">
                {managerId}
              </code>
              <button
                type="button"
                onClick={() => void copyManagerId()}
                className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none"
                aria-label="Copy manager ID"
              >
                {copied ? (
                  <Check className="size-3 text-emerald-600" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
            </dd>
          </div>
        </dl>

        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          Your password is stored as a bcrypt hash. Session tokens are signed JWTs delivered in an
          HttpOnly cookie, never exposed to JavaScript.
        </p>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-[0.6875rem] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-[0.6875rem] font-semibold text-foreground", valueClassName)}>
        {value}
      </dd>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
