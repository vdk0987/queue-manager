import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { QueueStatus } from "@/types/queue";

interface QueueStatusBadgeProps {
  status: QueueStatus;
  className?: string;
}

export function QueueStatusBadge({ status, className }: QueueStatusBadgeProps) {
  const isActive = status === "ACTIVE";

  return (
    <Badge
      variant={isActive ? "success" : "warning"}
      className={cn("uppercase tracking-[0.08em]", className)}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-amber-500")}
      />
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}

export function queueStatusLabel(status: QueueStatus): string {
  return status === "ACTIVE" ? "Active" : "Inactive";
}
