import { ArrowLeft, BarChart3, CalendarDays, Check, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDocumentTitle } from "@/hooks/use-document-title";

const features = [
  "Overview metrics across all of your queues",
  "Queue length trends with peak and average lines",
  "Waiting-time and service-duration breakdowns",
  "Completed versus cancelled token analysis",
  "Filters for queue and date range",
];

const bars = [42, 58, 50, 72, 64, 86, 78, 95, 68, 82, 74, 90];

export function AnalyticsPage() {
  useDocumentTitle("Analytics");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <span className="size-1.5 rounded-full bg-primary" />
            Insights
          </>
        }
        title="Analytics"
        description="Understand how your queues perform and where waiting time builds up."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <CalendarDays />
              Last 7 days
            </Button>
            <Badge variant="warning">Phase 5</Badge>
          </div>
        }
      />

      <div className="grid animate-fade-up gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <Card>
          <CardContent className="flex h-full flex-col p-6 sm:p-7">
            <div className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100">
              <BarChart3 className="size-5" />
            </div>

            <Badge variant="warning" className="mt-5 w-fit">
              Planned for Phase 5
            </Badge>

            <h2 className="mt-3 font-display text-xl font-bold tracking-tight text-foreground">
              Every insight, built on real records.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Analytics will be calculated from persisted tokens and timestamps — no estimates or
              guesswork. This screen unlocks once your first queue starts serving.
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

        <Card className="overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Queue length trend</p>
                <p className="text-xs text-muted-foreground">A preview of the Phase 5 dashboard</p>
              </div>
              <Badge variant="outline" className="bg-card">
                Preview
              </Badge>
            </div>

            <div aria-hidden="true" className="mt-5 select-none">
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "Avg. wait", value: "6m 20s" },
                  { label: "Served", value: "128" },
                  { label: "Peak queue", value: "24" },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-border/70 bg-background/70 px-3 py-2.5"
                  >
                    <p className="text-[0.5625rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {kpi.label}
                    </p>
                    <p className="mt-1 font-display text-base font-bold text-foreground/45">
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-emerald-700">
                    <TrendingUp className="size-3" />
                    Queue length
                  </div>
                  <span className="text-[0.5625rem] text-muted-foreground">Last 12 intervals</span>
                </div>

                <div className="mt-4 flex h-36 items-end gap-1.5 sm:gap-2">
                  {bars.map((height, index) => (
                    <div
                      key={index}
                      className="flex-1 rounded-t-[0.25rem] bg-gradient-to-t from-indigo-500/25 to-indigo-500/70"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>

                <div className="mt-2 flex justify-between border-t border-border/70 pt-2 text-[0.5625rem] text-muted-foreground">
                  <span>09:00</span>
                  <span>11:00</span>
                  <span>13:00</span>
                  <span>15:00</span>
                  <span>17:00</span>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-dashed border-border bg-card/50 px-3.5 py-3 text-center text-[0.625rem] text-muted-foreground">
                Illustrative data · charts connect to live records in Phase 5
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
