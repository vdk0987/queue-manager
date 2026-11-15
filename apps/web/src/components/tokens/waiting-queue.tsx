import {
  ArrowDown,
  ArrowUp,
  Clock3,
  ListOrdered,
  Phone,
  StickyNote,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn, formatClockTime, formatElapsed, pluralize } from "@/lib/utils";
import type { Queue } from "@/types/queue";
import type { Token } from "@/types/token";

interface WaitingQueueProps {
  queue: Queue;
  waiting: Token[];
  pendingTokenId: string | null;
  onMoveUp: (token: Token) => void;
  onMoveDown: (token: Token) => void;
  onCancel: (token: Token) => void;
  onAddParticipant: () => void;
}

export function WaitingQueue({
  queue,
  waiting,
  pendingTokenId,
  onMoveUp,
  onMoveDown,
  onCancel,
  onAddParticipant,
}: WaitingQueueProps) {
  const [now, setNow] = useState(() => new Date());
  const isActive = queue.status === "ACTIVE";
  const isBusy = pendingTokenId !== null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Waiting queue</CardTitle>
          <CardDescription>
            {waiting.length === 0
              ? "Participants waiting for their turn."
              : `${waiting.length} ${pluralize(waiting.length, "participant")} in line, ordered by position.`}
          </CardDescription>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="bg-card">
            <Users />
            {waiting.length} waiting
          </Badge>
          <Button
            size="sm"
            onClick={onAddParticipant}
            disabled={!isActive}
            title={!isActive ? "Activate this queue to add participants." : undefined}
          >
            <UserPlus />
            Add participant
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {!isActive ? (
          <p className="mb-3 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-800">
            This queue is inactive. Existing participants keep their positions, but new
            registrations are paused until you activate it again.
          </p>
        ) : null}

        {waiting.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/90 bg-muted/20 px-6 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm ring-1 ring-border/60">
              <ListOrdered className="size-5" />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">The line is empty</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {isActive
                ? "Add the first participant and a token will be generated automatically."
                : "Activate the queue to start registering participants again."}
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={onAddParticipant}
              disabled={!isActive}
            >
              <UserPlus />
              Add participant
            </Button>
          </div>
        ) : (
          <ol aria-label="Waiting tokens" className="space-y-2.5">
            {waiting.map((token, index) => {
              const isFirst = index === 0;
              const isLast = index === waiting.length - 1;
              const isPending = pendingTokenId === token.id;

              return (
                <li
                  key={token.id}
                  className={cn(
                    "rounded-xl border border-border/70 bg-background/60 p-3 transition-opacity sm:p-4",
                    isPending && "opacity-60",
                  )}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      aria-label={`Position ${token.position ?? index + 1}`}
                      className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 font-display text-sm font-bold text-indigo-700 ring-1 ring-indigo-100"
                    >
                      {token.position ?? index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {token.participantName}
                        </p>
                        <Badge variant="secondary" className="font-mono tracking-normal">
                          {token.displayToken}
                        </Badge>
                        {isPending ? <Spinner label="Updating token" /> : null}
                      </div>

                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3" />
                          Registered {formatClockTime(token.createdAt)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Waiting {formatElapsed(token.createdAt, now)}</span>
                        <span aria-hidden="true">·</span>
                        <span>Position {token.position ?? index + 1}</span>
                      </p>

                      {token.contactNumber || token.notes ? (
                        <div className="mt-1.5 space-y-0.5 text-[0.6875rem] text-muted-foreground">
                          {token.contactNumber ? (
                            <p className="flex items-center gap-1.5">
                              <Phone className="size-3 shrink-0" />
                              <span className="truncate">{token.contactNumber}</span>
                            </p>
                          ) : null}
                          {token.notes ? (
                            <p className="flex items-start gap-1.5">
                              <StickyNote className="mt-px size-3 shrink-0" />
                              <span className="break-words">{token.notes}</span>
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex w-full items-center justify-end gap-1 sm:w-auto sm:pt-0.5">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => onMoveUp(token)}
                        disabled={isFirst || isBusy}
                        aria-label={`Move ${token.displayToken} up`}
                        title={isFirst ? "Already first in line" : "Move up"}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => onMoveDown(token)}
                        disabled={isLast || isBusy}
                        aria-label={`Move ${token.displayToken} down`}
                        title={isLast ? "Already last in line" : "Move down"}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancel(token)}
                        disabled={isBusy}
                        className="text-destructive hover:bg-destructive/8 hover:text-destructive"
                        aria-label={`Cancel ${token.displayToken}`}
                      >
                        <X />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
