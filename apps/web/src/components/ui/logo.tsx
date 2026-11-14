import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[0.7rem] bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 text-white shadow-md shadow-indigo-950/25 ring-1 ring-white/15 ring-inset",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.42),transparent_55%)]" />
      <svg viewBox="0 0 24 24" fill="none" className="relative size-[62%]" aria-hidden="true">
        <path
          d="M5.5 7.5h13M5.5 12h9M5.5 16.5h5.5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="17.75" cy="16.5" r="2.5" className="fill-emerald-300" />
      </svg>
    </div>
  );
}

interface LogoProps {
  className?: string;
  markClassName?: string;
  tone?: "light" | "dark";
  showTagline?: boolean;
}

export function Logo({ className, markClassName, tone = "light", showTagline }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className={markClassName} />
      <div className="flex flex-col">
        <span
          className={cn(
            "font-display text-[1.0625rem] font-bold leading-tight tracking-tight",
            tone === "dark" ? "text-white" : "text-foreground",
          )}
        >
          Queue
          <span className={tone === "dark" ? "text-indigo-200" : "text-primary"}>Pilot</span>
        </span>
        {showTagline ? (
          <span
            className={cn(
              "text-[0.625rem] font-medium uppercase tracking-[0.14em]",
              tone === "dark" ? "text-indigo-200/70" : "text-muted-foreground",
            )}
          >
            Queue management
          </span>
        ) : null}
      </div>
    </div>
  );
}
