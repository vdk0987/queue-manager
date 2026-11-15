import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueues } from "@/hooks/use-queues";
import { analyticsApi, getErrorMessage } from "@/lib/api";
import type { AnalyticsDashboard } from "@/types/analytics";
import { useDocumentTitle } from "@/hooks/use-document-title";

type RangePreset = AnalyticsDashboard["range"]["preset"];

const RANGE_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const COLORS = ["#4f46e5", "#f59e0b", "#94a3b8", "#10b981", "#ef4444"];

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p>
            {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
          </div>
          <span className={`grid size-10 place-items-center rounded-xl ${tone}`}>
            <Icon className="size-4.5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartEmpty({ message = "No records for this range." }: { message?: string }) {
  return (
    <div className="grid h-64 place-items-center text-sm text-muted-foreground">{message}</div>
  );
}

export function AnalyticsPage() {
  useDocumentTitle("Analytics");
  const { queues, status: queuesStatus } = useQueues();
  const [range, setRange] = useState<RangePreset>("7d");
  const [queueId, setQueueId] = useState("");
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);

    analyticsApi
      .dashboard({ range, queueId: queueId || undefined, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response.data);
        setStatus("ready");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(getErrorMessage(requestError));
        setStatus("error");
      });

    return () => controller.abort();
  }, [range, queueId, reloadKey]);

  const statusData = useMemo(
    () => [
      { name: "Completed", value: data?.statusMix.completed ?? 0 },
      { name: "Cancelled", value: data?.statusMix.cancelled ?? 0 },
    ],
    [data],
  );

  const loading = status === "loading" && !data;

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
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter analytics by queue"
              value={queueId}
              onChange={(event) => setQueueId(event.target.value)}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All queues</option>
              {queues.map((queue) => (
                <option key={queue.id} value={queue.id}>
                  {queue.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter analytics by date range"
              value={range}
              onChange={(event) => setRange(event.target.value as RangePreset)}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              aria-label="Refresh analytics"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={status === "loading"}
            >
              <RefreshCw className={status === "loading" ? "animate-spin" : ""} />
            </Button>
          </div>
        }
      />

      {queuesStatus === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Queue filters could not be loaded.
        </p>
      ) : null}

      {error ? (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Registered"
              value={formatNumber(data.summary.registeredInRange)}
              detail={`${formatNumber(data.summary.totalTokens)} total records`}
              icon={Users}
              tone="bg-indigo-50 text-indigo-600"
            />
            <MetricCard
              label="Waiting now"
              value={formatNumber(data.summary.waiting)}
              detail={`${formatNumber(data.summary.inService)} currently serving`}
              icon={Clock3}
              tone="bg-amber-50 text-amber-600"
            />
            <MetricCard
              label="Completed"
              value={formatNumber(data.summary.completedInRange)}
              detail={`${formatPercent(data.summary.completionRate)} completion rate`}
              icon={CheckCircle2}
              tone="bg-emerald-50 text-emerald-600"
            />
            <MetricCard
              label="Cancelled"
              value={formatNumber(data.summary.cancelledInRange)}
              detail={`${formatNumber(data.summary.cancelled)} total cancelled`}
              icon={XCircle}
              tone="bg-rose-50 text-rose-600"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Average wait"
              value={formatDuration(data.metrics.averageWaitSeconds)}
              icon={Clock3}
              tone="bg-violet-50 text-violet-600"
            />
            <MetricCard
              label="Median wait"
              value={formatDuration(data.metrics.medianWaitSeconds)}
              icon={Activity}
              tone="bg-sky-50 text-sky-600"
            />
            <MetricCard
              label="Average service"
              value={formatDuration(data.metrics.averageServiceSeconds)}
              icon={BarChart3}
              tone="bg-cyan-50 text-cyan-600"
            />
            <MetricCard
              label="Peak queue"
              value={formatNumber(data.metrics.peakWaiting)}
              detail={`${formatNumber(data.summary.throughputPerDay)} completed/day`}
              icon={CalendarDays}
              tone="bg-orange-50 text-orange-600"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle>Queue activity</CardTitle>
                <CardDescription>
                  Registrations, completions, cancellations, and queue size at close.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.trend.some(
                  (point) => point.registered || point.completed || point.cancelled,
                ) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDay}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip labelFormatter={(value) => formatDay(String(value))} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="registered"
                        name="Registered"
                        stroke="#4f46e5"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="completed"
                        name="Completed"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="waitingAtClose"
                        name="Waiting at close"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Outcome mix</CardTitle>
                <CardDescription>
                  Completed and cancelled records in the selected range.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statusData.some((item) => item.value > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={72}
                        outerRadius={104}
                        paddingAngle={4}
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={entry.name} fill={COLORS[index]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Waiting-time distribution</CardTitle>
                <CardDescription>
                  Completed services grouped by how long participants waited.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.waitingBuckets.some((bucket) => bucket.count > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.waitingBuckets}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        name="Participants"
                        fill="#6366f1"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Service duration distribution</CardTitle>
                <CardDescription>Completed services grouped by duration.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.serviceBuckets.some((bucket) => bucket.count > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.serviceBuckets}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Services" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty />
                )}
              </CardContent>
            </Card>
          </div>

          {data.queues.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Queue comparison</CardTitle>
                <CardDescription>Current load and historical performance by queue.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      <tr>
                        <th className="pb-3 font-semibold">Queue</th>
                        <th className="pb-3 font-semibold">Waiting</th>
                        <th className="pb-3 font-semibold">Completed</th>
                        <th className="pb-3 font-semibold">Cancelled</th>
                        <th className="pb-3 font-semibold">Avg. wait</th>
                        <th className="pb-3 font-semibold">Avg. service</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {data.queues.map((queue) => (
                        <tr key={queue.id}>
                          <td className="py-3 font-medium">{queue.name}</td>
                          <td className="py-3">{formatNumber(queue.waiting + queue.inService)}</td>
                          <td className="py-3">{formatNumber(queue.completedInRange)}</td>
                          <td className="py-3">{formatNumber(queue.cancelledInRange)}</td>
                          <td className="py-3">{formatDuration(queue.averageWaitSeconds)}</td>
                          <td className="py-3">{formatDuration(queue.averageServiceSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
