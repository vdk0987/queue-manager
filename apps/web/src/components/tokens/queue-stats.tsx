import {
  CheckCircle2,
  Clock3,
  Hash,
  UserCheck,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatClockTime, formatShortDate } from "@/lib/utils";
import type { QueueTokenStats } from "@/types/token";

const tones = {
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  slate: "bg-slate-50 text-slate-600 ring-slate-100",
} as const;

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: keyof typeof tones;
}) {
  return (
    <Card>
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <span
            className={cn("grid size-7 shrink-0 place-items-center rounded-lg ring-1", tones[tone])}
          >
            <Icon className="size-3.5" />
          </span>
        </div>
        <p className="mt-2 font-display text-xl font-bold leading-tight tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-1 truncate text-[0.625rem] text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function QueueStatsGrid({ stats }: { stats: QueueTokenStats }) {
  const earliest = stats.earliestRegistrationAt;

  return (
    <section
      aria-label="Queue statistics"
      className="grid animate-fade-up grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
    >
      <StatTile
        icon={Hash}
        label="Total tokens"
        value={String(stats.totalGenerated)}
        detail="All registrations"
        tone="indigo"
      />
      <StatTile
        icon={Users}
        label="Waiting now"
        value={String(stats.waitingCount)}
        detail={`Queue length ${stats.currentQueueLength}`}
        tone="amber"
      />
      <StatTile
        icon={UserCheck}
        label="In service"
        value={String(stats.inServiceCount)}
        detail="Being served right now"
        tone="emerald"
      />
      <StatTile
        icon={CheckCircle2}
        label="Completed"
        value={String(stats.completedCount)}
        detail="Preserved for analytics"
        tone="violet"
      />
      <StatTile
        icon={XCircle}
        label="Cancelled"
        value={String(stats.cancelledCount)}
        detail="Kept for history"
        tone="rose"
      />
      <StatTile
        icon={Clock3}
        label="First registration"
        value={earliest ? formatClockTime(earliest) : "—"}
        detail={earliest ? formatShortDate(earliest) : "No tokens yet"}
        tone="slate"
      />
    </section>
  );
}
