import { CheckCircle2, ChevronRight, Clock3, Timer, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { TokenStatusBadge } from "@/components/tokens/token-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatClockTime, formatDurationSeconds } from "@/lib/utils";
import type { Token } from "@/types/token";

interface CurrentlyServingCardProps {
  token: Token | null;
  nextUp: Token | null;
  waitingCount: number;
  queueActive: boolean;
  pendingAction: "next" | "complete" | null;
  onNext: () => void;
  onComplete: (token: Token) => void;
}

export function CurrentlyServingCard({
  token,
  nextUp,
  waitingCount,
  queueActive,
  pendingAction,
  onNext,
  onComplete,
}: CurrentlyServingCardProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!token?.serviceStartedAt) return;

    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1_000);

    return () => window.clearInterval(timer);
  }, [token?.id, token?.serviceStartedAt]);

  const startedAt = token?.serviceStartedAt ? new Date(token.serviceStartedAt).getTime() : null;
  const elapsedSeconds =
    startedAt === null ? null : Math.max(0, Math.floor((now.getTime() - startedAt) / 1_000));

  const nextDisabled =
    pendingAction !== null || token !== null || waitingCount === 0 || !queueActive;
  const nextDisabledReason = token
    ? "Complete the current service before calling the next participant."
    : !queueActive
      ? "Activate this queue to start service."
      : waitingCount === 0
        ? "No participants are waiting."
        : undefined;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Currently serving</CardTitle>
          <CardDescription>The participant your team is serving right now.</CardDescription>
        </div>
        <Button
          onClick={onNext}
          disabled={nextDisabled}
          title={nextDisabledReason}
          aria-label="Assign the next waiting token"
        >
          {pendingAction === "next" ? <Spinner label="Assigning next token" /> : <ChevronRight />}
          Next token
        </Button>
      </CardHeader>

      <CardContent>
        {token ? (
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {token.displayToken}
                </p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">
                  {token.participantName}
                </p>
              </div>
              <TokenStatusBadge status={token.status} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3.5" />
                Started{" "}
                {token.serviceStartedAt ? formatClockTime(token.serviceStartedAt) : "just now"}
              </span>
              <Badge variant="success" className="font-mono tracking-normal">
                <Timer />
                Elapsed {formatDurationSeconds(elapsedSeconds)}
              </Badge>
            </div>

            <Button
              className="mt-4 w-full sm:w-auto"
              onClick={() => onComplete(token)}
              disabled={pendingAction !== null}
            >
              {pendingAction === "complete" ? (
                <Spinner label="Completing service" />
              ) : (
                <CheckCircle2 />
              )}
              Complete service
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm ring-1 ring-border/60">
              <UserCheck className="size-5" />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">No one is being served</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {nextUp
                ? `Next up: ${nextUp.displayToken} · ${nextUp.participantName}. Press Next token to start service.`
                : queueActive
                  ? "The waiting list is empty. Add a participant to start the next service."
                  : "Activate this queue to start serving participants again."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
