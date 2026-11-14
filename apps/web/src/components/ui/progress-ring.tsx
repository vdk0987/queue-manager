import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number;
  label: string;
  className?: string;
}

export function ProgressRing({ value, label, className }: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("relative grid size-[5.25rem] place-items-center", className)}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-white/10"
        />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="url(#progress-gradient)"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${clamped} 100`}
        />
        <defs>
          <linearGradient id="progress-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <span className="relative font-display text-sm font-bold text-white">{label}</span>
    </div>
  );
}
