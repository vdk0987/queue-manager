import { ArrowLeft, Check, ListOrdered, Plus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDocumentTitle } from "@/hooks/use-document-title";

const features = [
  "Create and name multiple queues",
  "Activate, pause or archive a queue",
  "See waiting counts and the active token at a glance",
  "Switch between queues without losing your place",
];

const previewQueues = [
  {
    name: "Customer support",
    waiting: 12,
    serving: "Q001-012",
    tone: "bg-indigo-50 text-indigo-600",
  },
  {
    name: "Bill payments",
    waiting: 5,
    serving: "Q002-007",
    tone: "bg-emerald-50 text-emerald-600",
  },
  { name: "New accounts", waiting: 3, serving: null, tone: "bg-amber-50 text-amber-600" },
];

export function QueuesPage() {
  useDocumentTitle("Queues");

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
        description="A single place to create, organise and run every line your team manages."
        actions={
          <Button
            onClick={() =>
              toast.info("Queue creation arrives in Phase 2. Your account foundation is ready.")
            }
          >
            <Plus />
            New queue
            <Badge
              variant="secondary"
              className="ml-1 bg-primary-foreground/15 text-primary-foreground"
            >
              Phase 2
            </Badge>
          </Button>
        }
      />

      <div className="grid animate-fade-up gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden">
          <CardContent className="flex h-full flex-col p-6 sm:p-7">
            <div className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
              <ListOrdered className="size-5" />
            </div>

            <Badge variant="warning" className="mt-5 w-fit">
              Planned for Phase 2
            </Badge>

            <h2 className="mt-3 font-display text-xl font-bold tracking-tight text-foreground">
              Queue management is on the way.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The account layer is complete. Phase 2 adds the operational home for your queues —
              creation, status control and a fast switch between every line.
            </p>

            <ul className="mt-5 space-y-2.5">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground/85">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    <Check className="size-3" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-7">
              <Button variant="outline" asChild className="w-fit">
                <Link to="/">
                  <ArrowLeft />
                  Back to overview
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-card">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.09),transparent_70%)]"
          />
          <CardContent className="relative p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Workspace preview</p>
                <p className="text-xs text-muted-foreground">How your queues will look</p>
              </div>
              <Badge variant="outline" className="bg-card">
                Preview
              </Badge>
            </div>

            <div
              aria-hidden="true"
              className="select-none rounded-2xl border border-border/80 bg-background/60 p-3"
            >
              <div className="mb-3 flex items-center justify-between rounded-xl border border-border/70 bg-card px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                    <ListOrdered className="size-3.5" />
                  </span>
                  <span className="text-xs font-semibold">All queues</span>
                </div>
                <span className="text-[0.625rem] font-medium text-muted-foreground">
                  3 queues · 20 waiting
                </span>
              </div>

              <div className="space-y-2">
                {previewQueues.map((queue) => (
                  <div
                    key={queue.name}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 shadow-xs"
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg ${queue.tone}`}
                    >
                      <Users className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">{queue.name}</p>
                      <p className="mt-0.5 truncate text-[0.625rem] text-muted-foreground">
                        {queue.serving ? (
                          <>
                            Serving{" "}
                            <span className="font-semibold text-foreground">{queue.serving}</span>
                            {" · "}
                            {queue.waiting} waiting
                          </>
                        ) : (
                          <>Idle · {queue.waiting} waiting</>
                        )}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                      <span className="size-1 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-dashed border-border bg-card/50 px-3.5 py-3 text-center text-[0.625rem] text-muted-foreground">
                Illustrative interface · connects in Phase 2
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
