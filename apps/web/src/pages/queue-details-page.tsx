import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  Hash,
  ListOrdered,
  LockKeyhole,
  PauseCircle,
  Pencil,
  PlayCircle,
  RefreshCw,
  SearchX,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { QueueFormDialog } from "@/components/queues/queue-form-dialog";
import { QueueStatusBadge } from "@/components/queues/queue-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ApiError, getErrorMessage, queueApi } from "@/lib/api";
import { cn, formatShortDate } from "@/lib/utils";
import type { Queue } from "@/types/queue";

type PageStatus = "loading" | "ready" | "not-found" | "invalid" | "error";

export function QueueDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);

  useDocumentTitle(status === "ready" && queue ? queue.name : "Queue details");

  useEffect(() => {
    if (!id) {
      setStatus("not-found");
      return;
    }

    const controller = new AbortController();

    setQueue(null);
    setStatus("loading");
    setError(null);

    queueApi
      .get(id, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setQueue(data);
        setStatus("ready");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;

        if (requestError instanceof ApiError) {
          if (requestError.status === 404 || requestError.code === "QUEUE_NOT_FOUND") {
            setStatus("not-found");
            return;
          }

          if (requestError.status === 400) {
            setStatus("invalid");
            return;
          }
        }

        setError(getErrorMessage(requestError));
        setStatus("error");
      });

    return () => controller.abort();
  }, [id, reloadKey]);

  async function changeStatus(nextStatus: "ACTIVE" | "INACTIVE") {
    if (!queue) return;

    setStatusPending(true);

    try {
      const response = await queueApi.updateStatus(queue.id, nextStatus);
      setQueue(response.data);
      toast.success(
        nextStatus === "ACTIVE"
          ? "Queue activated. It can accept participants again."
          : "Queue deactivated. Existing history is preserved.",
      );
      setDeactivateOpen(false);
    } catch (requestError) {
      toast.error(getErrorMessage(requestError));
    } finally {
      setStatusPending(false);
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
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <Alert variant="destructive" className="border-0 bg-transparent p-0">
              <AlertCircle />
              <AlertDescription>{error ?? "We couldn't load this queue."}</AlertDescription>
            </Alert>
            <Button
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
              className="shrink-0"
            >
              <RefreshCw />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {status === "ready" && queue ? (
        <>
          {queue.status === "INACTIVE" ? (
            <Alert variant="default" className="border-amber-200 bg-amber-50/70 text-amber-900">
              <PauseCircle className="text-amber-600" />
              <AlertDescription>
                <span className="font-semibold">This queue is inactive.</span> New participants
                can&apos;t be added until you activate it again. Existing history is preserved.
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
                Queue details
              </>
            }
            title={queue.name}
            description={`Created ${formatShortDate(queue.createdAt)} · ${queue.waitingCount} waiting · Last updated ${formatShortDate(queue.updatedAt)}`}
            actions={
              <>
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
              </>
            }
          />

          <div className="grid animate-fade-up gap-4 xl:grid-cols-[1.3fr_0.7fr] [animation-delay:60ms]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Currently serving</CardTitle>
                    <CardDescription>The token your team is serving right now.</CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0 bg-muted/40">
                    <LockKeyhole />
                    Phase 3
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-10 text-center">
                    <div className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm ring-1 ring-border/60">
                      <UserCheck className="size-5" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-foreground">
                      No one is being served
                    </p>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      The active token and service timer will appear here when token management
                      arrives in Phase 3.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Waiting queue</CardTitle>
                    <CardDescription>Participants waiting for their turn.</CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0 bg-card">
                    <Users />
                    {queue.waitingCount} waiting
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-10 text-center">
                    <div className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm ring-1 ring-border/60">
                      <Users className="size-5" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-foreground">The line is empty</p>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      Waiting participants will appear here once token management ships in Phase 3.
                    </p>

                    <Button
                      variant="outline"
                      disabled
                      className="mt-5"
                      aria-label="Add participant — available in Phase 3"
                    >
                      <UserPlus />
                      Add participant
                      <Badge variant="secondary" className="ml-1">
                        Phase 3
                      </Badge>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

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
                  <DetailRow label="Waiting count">
                    <span className="font-medium text-foreground">{queue.waitingCount}</span>
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
          </div>

          <QueueFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            mode="edit"
            queue={queue}
            onSaved={(updated) => setQueue(updated)}
          />

          <ConfirmDialog
            open={deactivateOpen}
            onOpenChange={setDeactivateOpen}
            title="Deactivate this queue?"
            description={
              <>
                <span className="font-semibold text-foreground">{queue.name}</span> will stop
                accepting new participants until you activate it again. Existing history and queue
                settings are preserved.
              </>
            }
            confirmLabel="Deactivate queue"
            variant="destructive"
            loading={statusPending}
            onConfirm={() => void changeStatus("INACTIVE")}
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
}: {
  icon: LucideIcon;
  title: string;
  description: string;
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
        <Button asChild className="mt-6">
          <Link to="/queues">
            <ArrowLeft />
            Back to queues
          </Link>
        </Button>
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
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
