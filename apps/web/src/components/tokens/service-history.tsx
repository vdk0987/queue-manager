import { AlertCircle, CheckCircle2, History, RefreshCw, XCircle } from "lucide-react";
import { TokenStatusBadge } from "@/components/tokens/token-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useQueueHistory } from "@/hooks/use-queue-history";
import { cn, formatDateTime, formatDurationSeconds, pluralize } from "@/lib/utils";
import type { HistoryStatusFilter, Token } from "@/types/token";

const FILTERS: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

interface ServiceHistoryProps {
  queueId: string;
  refreshKey: number;
}

export function ServiceHistory({ queueId, refreshKey }: ServiceHistoryProps) {
  const { data, status, error, isFetching, page, statusFilter, setPage, setStatusFilter, refresh } =
    useQueueHistory(queueId, refreshKey);

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const start = pagination && pagination.total > 0 ? (page - 1) * pagination.limit + 1 : 0;
  const end = pagination ? Math.min(page * pagination.limit, pagination.total) : 0;

  return (
    <Card className="animate-fade-up [animation-delay:120ms]">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4 text-indigo-600" />
            Service history
          </CardTitle>
          <CardDescription>
            {pagination
              ? `${pagination.total} ${pluralize(pagination.total, "record")} of completed and cancelled service.`
              : "Completed and cancelled tokens, newest first."}
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter service history"
            className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-muted/30 p-0.5"
          >
            {FILTERS.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant={statusFilter === filter.value ? "default" : "ghost"}
                className={cn(
                  "h-7 rounded-md px-2.5",
                  statusFilter !== filter.value && "text-muted-foreground",
                )}
                onClick={() => setStatusFilter(filter.value)}
                disabled={isFetching}
              >
                {filter.label}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={refresh}
            disabled={isFetching}
            aria-label="Refresh service history"
            title="Refresh history"
          >
            {isFetching ? <Spinner label="Refreshing history" /> : <RefreshCw />}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {status === "error" ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{error ?? "We couldn't load service history."}</span>
              <Button variant="outline" size="sm" onClick={refresh}>
                <RefreshCw />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {status === "loading" ? <HistorySkeleton /> : null}

        {status !== "loading" && status !== "error" && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm ring-1 ring-border/60">
              {statusFilter === "CANCELLED" ? (
                <XCircle className="size-5" />
              ) : (
                <CheckCircle2 className="size-5" />
              )}
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">No history yet</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {statusFilter === "ALL"
                ? "Completed and cancelled tokens will appear here once service begins."
                : `There are no ${statusFilter.toLowerCase()} tokens for this queue.`}
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-2 py-2.5">Token</th>
                  <th className="px-2 py-2.5">Participant</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5">Started</th>
                  <th className="px-2 py-2.5">Ended</th>
                  <th className="px-2 py-2.5 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((token: Token) => (
                  <tr key={token.id} className="align-top">
                    <td className="px-2 py-3">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {token.displayToken}
                      </span>
                    </td>
                    <td className="max-w-[14rem] truncate px-2 py-3 font-medium text-foreground">
                      {token.participantName}
                    </td>
                    <td className="px-2 py-3">
                      <TokenStatusBadge status={token.status} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-xs text-muted-foreground">
                      {token.serviceStartedAt ? formatDateTime(token.serviceStartedAt) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-xs text-muted-foreground">
                      {token.status === "CANCELLED"
                        ? token.cancelledAt
                          ? `Cancelled ${formatDateTime(token.cancelledAt)}`
                          : "—"
                        : token.serviceCompletedAt
                          ? formatDateTime(token.serviceCompletedAt)
                          : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right text-xs font-medium text-foreground">
                      {formatDurationSeconds(token.serviceDurationSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {pagination && pagination.total > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <span>
              Showing {start}–{end} of {pagination.total} · Page {pagination.page} of{" "}
              {pagination.totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={!pagination.hasPreviousPage || isFetching}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!pagination.hasNextPage || isFetching}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
