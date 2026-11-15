export interface AnalyticsBucket {
  key: string;
  label: string;
  count: number;
}

export interface AnalyticsDashboard {
  generatedAt: string;
  range: { preset: "today" | "7d" | "30d" | "90d" | "all"; from: string; to: string; days: number };
  scope: { queueId: string | null; queueName: string | null };
  summary: {
    queues: number;
    activeQueues: number;
    totalTokens: number;
    waiting: number;
    inService: number;
    completed: number;
    cancelled: number;
    registeredInRange: number;
    completedInRange: number;
    cancelledInRange: number;
    completionRate: number | null;
    throughputPerDay: number;
  };
  metrics: {
    averageWaitSeconds: number | null;
    medianWaitSeconds: number | null;
    longestWaitSeconds: number | null;
    averageServiceSeconds: number | null;
    medianServiceSeconds: number | null;
    longestServiceSeconds: number | null;
    peakWaiting: number;
  };
  trend: Array<{
    date: string;
    registered: number;
    completed: number;
    cancelled: number;
    averageWaitSeconds: number | null;
    waitingAtClose: number;
  }>;
  waitingBuckets: AnalyticsBucket[];
  serviceBuckets: AnalyticsBucket[];
  statusMix: { completed: number; cancelled: number };
  queues: Array<{
    id: string;
    name: string;
    waiting: number;
    inService: number;
    completed: number;
    cancelled: number;
    completedInRange: number;
    cancelledInRange: number;
    averageWaitSeconds: number | null;
    averageServiceSeconds: number | null;
  }>;
}
