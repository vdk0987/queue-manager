import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TokenStatus } from "@/types/token";

const statusStyles = {
  WAITING: {
    label: "Waiting",
    variant: "warning" as const,
    dot: "bg-amber-500",
  },
  IN_SERVICE: {
    label: "In service",
    variant: "success" as const,
    dot: "bg-emerald-500",
  },
  COMPLETED: {
    label: "Completed",
    variant: "outline" as const,
    dot: "bg-slate-400",
  },
  CANCELLED: {
    label: "Cancelled",
    variant: "destructive" as const,
    dot: "bg-red-500",
  },
};

export function TokenStatusBadge({
  status,
  className,
}: {
  status: TokenStatus;
  className?: string;
}) {
  const style = statusStyles[status];

  return (
    <Badge variant={style.variant} className={cn("uppercase tracking-[0.08em]", className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </Badge>
  );
}
