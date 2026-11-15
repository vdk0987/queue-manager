import { Clock3, LockKeyhole, UserCheck } from "lucide-react";
import { TokenStatusBadge } from "@/components/tokens/token-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatClockTime } from "@/lib/utils";
import type { Token } from "@/types/token";

export function CurrentlyServingCard({ token }: { token: Token | null }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Currently serving</CardTitle>
          <CardDescription>The participant your team is serving right now.</CardDescription>
        </div>
        <Badge variant="outline" className="shrink-0 bg-muted/40">
          <LockKeyhole />
          Phase 4
        </Badge>
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
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" />
              Service started{" "}
              {token.serviceStartedAt ? formatClockTime(token.serviceStartedAt) : "just now"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm ring-1 ring-border/60">
              <UserCheck className="size-5" />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">No one is being served</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Starting service, completing visits and recording service times arrive in Phase 4. The
              waiting list is fully operational now.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
