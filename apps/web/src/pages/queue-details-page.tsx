import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  Hash,
  ListOrdered,
  PauseCircle,
  Pencil,
  PlayCircle,
  RefreshCw,
  SearchX,
  Ticket,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { QueueFormDialog } from "@/components/queues/queue-form-dialog";
import { QueueStatusBadge } from "@/components/queues/queue-status-badge";
import { AddParticipantDialog } from "@/components/tokens/add-participant-dialog";
import { CurrentlyServingCard } from "@/components/tokens/currently-serving-card";
import { QueueStatsGrid } from "@/components/tokens/queue-stats";
import { WaitingQueue } from "@/components/tokens/waiting-queue";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useQueueTokens } from "@/hooks/use-queue-tokens";
import { getErrorMessage, queueApi, tokenApi } from "@/lib/api";
import { cn, formatShortDate } from "@/lib/utils";
import type { Queue } from "@/types/queue";
import type { Token } from "@/types/token";

export function QueueDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, status, error, refresh, update } = useQueueTokens(id);

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [pendingTokenId, setPendingTokenId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Token | null>(null);
  const [cancelPending, setCancelPending] = useState(false);

  const queue = data?.queue ?? null;

  useDocumentTitle(queue?.name ?? "Queue details");

  async function changeStatus(nextStatus: "ACTIVE" | "INACTIVE") {
    if (!queue) return;

    setStatusPending(true);

    try {
      const response = await queueApi.updateStatus(queue.id, nextStatus);
      update((current) => ({ ...current, queue: response.data }));
      toast.success(
        nextStatus === "ACTIVE"
          ? "Queue activated. It can accept participants again."
          : "Queue deactivated. Existing participants and history are preserved.",
      );
      setDeactivateOpen(false);
    } catch (requestError) {
      toast.error(getErrorMessage(requestError));
    } finally {
      setStatusPending(false);
    }
  }

  function handleQueueSaved(updatedQueue: Queue) {
    update((current) => ({ ...current, queue: updatedQueue }));
  }

  async function handleMove(token: Token, direction: "UP" | "DOWN") {
    if (pendingTokenId) return;

    setPendingTokenId(token.id);

    try {
      const response = await tokenApi.reorder(token.id, { direction });
      const moved = response.data.token;
      const waiting = response.data.waiting;

      update((current) => ({
        ...current,
        waiting,
        waitingCount: waiting.length,
        tokens: current.tokens.map((item) => (item.id === moved.id ? moved : item)),
      }));

      toast.success(
        direction === "UP"
          ? `${moved.displayToken} moved up to position ${moved.position}.`
          : `${moved.displayToken} moved down to position ${moved.position}.`,
      );
    } catch (requestError) {
      toast.error(getErrorMessage(requestError));
      refresh();
    } finally {
      setPendingTokenId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;

    setCancelPending(true);

    try {
      const response = await tokenApi.cancel(cancelTarget.id);
      const { token, waiting, waitingCount, stats } = response.data;

      update((current) => ({
        ...current,
        waiting,
        waitingCount,
        stats,
        queue: { ...current.queue, waitingCount },
        tokens: current.tokens.map((item) => (item.id === token.id ? token : item)),
      }));

      toast.success(`${token.displayToken} cancelled. The record is preserved for history.`);
      setCancelTarget(null);
    } catch (requestError) {
      toast.error(getErrorMessage(requestError));
      setCancelTarget(null);
      refresh();
    } finally {
      setCancelPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs name={queue?.name} />

      {status === "loading" ? <DetailsSkeleton /> : null}

      {status === "not-found" ? (
        <StateCard
          icon={SearchX}
          title="Queue not found"
          description="This queue may have been removed, or it belongs to another manager's workspace. Check the link and try again."
        />
      ) : null}

      {status === "invalid" ? (
        <StateCard
          icon={Hash}
          title="This queue link isn't valid"
          description="The queue identifier in the address is malformed. Open the queue from your workspace list instead."
        />
      ) : null}

      {status === "error" ? (
        <StateCard
          icon={AlertCircle}
          title="We couldn't load this queue"
          description={error ?? "Check your connection and try again."}
          action={
            <Button onClick={refresh}>
              <RefreshCw />
              Try again
            </Button>
          }
        />
      ) : null}

      {status === "ready" && data && queue ? (
        <>
          {queue.status === "INACTIVE" ? (
            <Alert variant="default" className="border-amber-200 bg-amber-50/70 text-amber-900">
              <PauseCircle className="text-amber-600" />
              <AlertDescription>
                <span className="font-semibold">This queue is inactive.</span> New participants
                can&apos;t be added until you activate it again. The current waiting list and its
                positions are preserved.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error} The last loaded queue state is still shown.</span>
                <Button variant="outline" size="sm" onClick={refresh}>
                  <RefreshCw />
                  Refresh
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <PageHeader
            eyebrow={
              <>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    queue.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
                Queue details · {queue.code}
              </>
            }
            title={queue.name}
            description={`Created ${formatShortDate(queue.createdAt)} · ${data.stats.totalGenerated} tokens generated · Last updated ${formatShortDate(queue.updatedAt)}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setAddOpen(true)}
                  disabled={queue.status !== "ACTIVE"}
                  title={
                    queue.status !== "ACTIVE"
                      ? "Activate this queue to add participants."
                      : undefined
                  }
                >
                  <UserPlus />
                  Add participant
                </Button>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil />
                  Edit
                </Button>
                {queue.status === "ACTIVE" ? (
                  <Button
                    variant="destructive"
                    onClick={() => setDeactivateOpen(true)}
                    disabled={statusPending}
                  >
                    <PauseCircle />
                    Deactivate
                  </Button>
                ) : (
                  <Button onClick={() => void changeStatus("ACTIVE")} disabled={statusPending}>
                    {statusPending ? <Spinner label="Activating queue" /> : <PlayCircle />}
                    Activate
                  </Button>
                )}
              </div>
            }
          />

          <QueueStatsGrid stats={data.stats} />

          <div className="grid animate-fade-up gap-4 xl:grid-cols-[1.35fr_0.65fr] [animation-delay:60ms]">
            <div className="space-y-4">
              <CurrentlyServingCard token={data.currentlyServing} />

              <WaitingQueue
                queue={queue}
                waiting={data.waiting}
                pendingTokenId={pendingTokenId}
                onMoveUp={(token) => void handleMove(token, "UP")}
                onMoveDown={(token) => void handleMove(token, "DOWN")}
                onCancel={setCancelTarget}
                onAddParticipant={() => setAddOpen(true)}
              />
            </div>

            <div className="space-y-4">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Queue information</CardTitle>
                  <CardDescription>Reference details for this line.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3.5 text-sm">
                    <DetailRow label="Status">
                      <QueueStatusBadge status={queue.status} />
                    </DetailRow>
                    <DetailRow label="Queue code">
                      <code className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {queue.code}
                      </code>
                    </DetailRow>
                    <DetailRow label="Waiting now">
                      <span className="font-medium text-foreground">{data.stats.waitingCount}</span>
                    </DetailRow>
                    <DetailRow label="Total tokens">
                      <span className="font-medium text-foreground">
                        {data.stats.totalGenerated}
                      </span>
                    </DetailRow>
                    <DetailRow label="Created">
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <CalendarDays className="size-3.5 text-muted-foreground" />
                        {formatShortDate(queue.createdAt)}
                      </span>
                    </DetailRow>
                    <DetailRow label="Last updated">
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Clock3 className="size-3.5 text-muted-foreground" />
                        {formatShortDate(queue.updatedAt)}
                      </span>
                    </DetailRow>
                    <DetailRow label="Queue ID">
                      <code className="block break-all font-mono text-xs text-muted-foreground">
                        {queue.id}
                      </code>
                    </DetailRow>
                  </dl>
                </CardContent>
              </Card>

              <Card className="h-fit border-indigo-100/80 bg-indigo-50/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ticket className="size-4 text-indigo-600" />
                    Token numbering
                  </CardTitle>
                  <CardDescription>
                    Numbers stay permanent even when the line changes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                  <p className="rounded-lg border border-indigo-100 bg-card px-3 py-2 font-mono text-sm font-semibold text-indigo-700">
                    {queue.code}-001
                  </p>
                  <p>
                    The queue code identifies the line. The number after it is assigned once and
                    never changes, even after reordering, cancellation or completion.
                  </p>
                  <p>
                    Positions are recalculated automatically when a token is moved or cancelled, so
                    the waiting list never keeps gaps.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <AddParticipantDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            queueId={queue.id}
            queueName={queue.name}
            onRegistered={() => refresh()}
          />

          <QueueFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            mode="edit"
            queue={queue}
            onSaved={handleQueueSaved}
          />

          <ConfirmDialog
            open={deactivateOpen}
            onOpenChange={setDeactivateOpen}
            title="Deactivate this queue?"
            description={
              <>
                <span className="font-semibold text-foreground">{queue.name}</span> will stop
                accepting new participants until you activate it again. Waiting participants and
                their order are preserved. Deactivation is blocked while someone is being served.
              </>
            }
            confirmLabel="Deactivate queue"
            variant="destructive"
            loading={statusPending}
            onConfirm={() => void changeStatus("INACTIVE")}
          />

          <ConfirmDialog
            open={cancelTarget !== null}
            onOpenChange={(open) => !open && !cancelPending && setCancelTarget(null)}
            title={cancelTarget ? `Cancel ${cancelTarget.displayToken}?` : "Cancel token?"}
            description={
              cancelTarget ? (
                <>
                  <span className="font-semibold text-foreground">
                    {cancelTarget.participantName}
                  </span>{" "}
                  will be removed from the waiting list. The token record is kept for history, and
                  the participants behind it move up one position.
                </>
              ) : null
            }
            confirmLabel="Cancel token"
            variant="destructive"
            loading={cancelPending}
            onConfirm={() => void confirmCancel()}
          />
        </>
      ) : null}
    </div>
  );
}

function Breadcrumbs({ name }: { name?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="animate-fade-in">
      <ol className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <li>
          <Link
            to="/queues"
            className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 font-medium transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none"
          >
            <ListOrdered className="size-3.5" />
            Queues
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="size-3.5 text-border" />
        </li>
        <li className="min-w-0">
          <span
            aria-current={name ? "page" : undefined}
            className="block truncate px-1 font-semibold text-foreground"
          >
            {name ?? "Queue details"}
          </span>
        </li>
      </ol>
    </nav>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3.5 last:border-0 last:pb-0">
      <dt className="shrink-0 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function StateCard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-14 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border/70">
          <Icon className="size-6" />
        </div>
        <h1 className="mt-5 font-display text-xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action ?? (
          <Button asChild className="mt-6">
            <Link to="/queues">
              <ArrowLeft />
              Back to queues
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[6.25rem] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
