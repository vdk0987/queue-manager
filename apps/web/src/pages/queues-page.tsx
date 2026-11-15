import {
  AlertCircle,
  ArrowRight,
  Clock3,
  ListOrdered,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { QueueFormDialog } from "@/components/queues/queue-form-dialog";
import { QueueStatusBadge } from "@/components/queues/queue-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useQueues } from "@/hooks/use-queues";
import { getErrorMessage, queueApi } from "@/lib/api";
import { cn, formatShortDate, pluralize } from "@/lib/utils";
import type { Queue } from "@/types/queue";

export function QueuesPage() {
  useDocumentTitle("Queues");

  const { queues, status, error, refresh, addQueue, replaceQueue } = useQueues();
  const [createOpen, setCreateOpen] = useState(false);
  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [deactivateQueue, setDeactivateQueue] = useState<Queue | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);

  const activeCount = queues.filter((queue) => queue.status === "ACTIVE").length;
  const inactiveCount = queues.length - activeCount;

  function handleSaved(queue: Queue) {
    if (editQueue) {
      replaceQueue(queue);
      setEditQueue(null);
      return;
    }

    addQueue(queue);
  }

  async function changeStatus(queue: Queue, nextStatus: "ACTIVE" | "INACTIVE") {
    setStatusPendingId(queue.id);

    try {
      const response = await queueApi.updateStatus(queue.id, nextStatus);
      replaceQueue(response.data);
      toast.success(
        nextStatus === "ACTIVE"
          ? `"${queue.name}" is accepting participants again.`
          : `"${queue.name}" has been deactivated.`,
      );
      setDeactivateQueue(null);
    } catch (requestError) {
      toast.error(getErrorMessage(requestError));
    } finally {
      setStatusPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <span className="size-1.5 rounded-full bg-primary" />
            Workspace
          </>
        }
        title="Queues"
        description="Create, organise and run every line your team manages from one place."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Create queue
          </Button>
        }
      />

      {status === "ready" && queues.length > 0 ? (
        <section
          aria-label="Queue summary"
          className="grid animate-fade-up grid-cols-3 gap-3 [animation-delay:40ms]"
        >
          <SummaryTile label="Total queues" value={queues.length} tone="indigo" />
          <SummaryTile label="Active" value={activeCount} tone="emerald" />
          <SummaryTile label="Inactive" value={inactiveCount} tone="amber" />
        </section>
      ) : null}

      <section className="animate-fade-up [animation-delay:90ms]" aria-live="polite">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Your queues</h2>
            <p className="text-xs text-muted-foreground">
              {status === "ready"
                ? `${queues.length} ${pluralize(queues.length, "queue")} in this workspace`
                : "Loading your workspace queues…"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={status === "loading"}
            aria-label="Refresh queues"
          >
            <RefreshCw className={cn(status === "loading" && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {status === "loading" ? <QueueListSkeleton /> : null}

        {status === "error" ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <Alert variant="destructive" className="border-0 bg-transparent p-0">
                <AlertCircle />
                <AlertDescription>{error ?? "We couldn't load your queues."}</AlertDescription>
              </Alert>
              <Button variant="outline" onClick={refresh} className="shrink-0">
                <RefreshCw />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {status === "ready" && queues.length === 0 ? (
          <EmptyQueues onCreate={() => setCreateOpen(true)} />
        ) : null}

        {status === "ready" && queues.length > 0 ? (
          <ul aria-label="Queues" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {queues.map((queue) => (
              <li key={queue.id}>
                <QueueCard
                  queue={queue}
                  busy={statusPendingId === queue.id}
                  onEdit={() => setEditQueue(queue)}
                  onDeactivate={() => setDeactivateQueue(queue)}
                  onActivate={() => void changeStatus(queue, "ACTIVE")}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <QueueFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSaved={handleSaved}
      />

      <QueueFormDialog
        open={editQueue !== null}
        onOpenChange={(open) => !open && setEditQueue(null)}
        mode="edit"
        queue={editQueue ?? undefined}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deactivateQueue !== null}
        onOpenChange={(open) => !open && setDeactivateQueue(null)}
        title="Deactivate this queue?"
        description={
          deactivateQueue ? (
            <>
              <span className="font-semibold text-foreground">{deactivateQueue.name}</span> will
              stop accepting new participants until you activate it again. Existing history and
              queue settings are preserved.
            </>
          ) : null
        }
        confirmLabel="Deactivate queue"
        variant="destructive"
        loading={deactivateQueue !== null && statusPendingId === deactivateQueue.id}
        onConfirm={() => {
          if (deactivateQueue) void changeStatus(deactivateQueue, "INACTIVE");
        }}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "indigo" | "emerald" | "amber";
}) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
  } as const;

  return (
    <Card>
      <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
        <span
          className={cn(
            "hidden size-9 shrink-0 place-items-center rounded-xl ring-1 sm:grid",
            tones[tone],
          )}
        >
          <ListOrdered className="size-[1.125rem]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p className="font-display text-xl font-bold leading-tight text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueCard({
  queue,
  busy,
  onEdit,
  onDeactivate,
  onActivate,
}: {
  queue: Queue;
  busy: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
}) {
  const isActive = queue.status === "ACTIVE";

  return (
    <Card
      className={cn(
        "flex h-full flex-col transition-shadow hover:shadow-lifted",
        !isActive && "border-amber-200/80 bg-amber-50/25",
      )}
    >
      <CardContent className="flex flex-1 flex-col p-5 pt-7 sm:p-6 sm:pt-8">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
              isActive
                ? "bg-indigo-50 text-indigo-600 ring-indigo-100"
                : "bg-amber-100/70 text-amber-700 ring-amber-200/70",
            )}
          >
            <ListOrdered className="size-[1.125rem]" />
          </span>

          <div className="min-w-0 flex-1">
            <Link
              to={`/queues/${queue.id}`}
              className="block truncate text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none"
            >
              {queue.name}
            </Link>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" />
                Created {formatShortDate(queue.createdAt)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                {queue.waitingCount} waiting
              </span>
            </p>
          </div>

          <QueueStatusBadge status={queue.status} />
        </div>

        {!isActive ? (
          <p className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-[0.6875rem] leading-relaxed text-amber-800">
            This queue is paused and won&apos;t accept new participants.
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-5">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/queues/${queue.id}`}>
              Open
              <ArrowRight />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit} disabled={busy}>
            <Pencil />
            Edit
          </Button>

          <span className="ml-auto">
            {isActive ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeactivate}
                disabled={busy}
                className="text-destructive hover:bg-destructive/8 hover:text-destructive"
              >
                {busy ? <Spinner label="Deactivating queue" /> : <PauseCircle />}
                Deactivate
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onActivate}
                disabled={busy}
                className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {busy ? <Spinner label="Activating queue" /> : <PlayCircle />}
                Activate
              </Button>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="mt-5 flex gap-2">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyQueues({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center px-6 py-14 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <ListOrdered className="size-6" />
        </div>
        <h3 className="mt-5 font-display text-lg font-bold tracking-tight text-foreground">
          No queues yet
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Create your first queue to start organising the people your team serves. You can add more
          lines at any time.
        </p>
        <Button onClick={onCreate} className="mt-6">
          <Plus />
          Create your first queue
        </Button>
      </CardContent>
    </Card>
  );
}
