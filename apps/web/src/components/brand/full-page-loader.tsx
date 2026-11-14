import { BrandMark } from "@/components/ui/logo";

export function FullPageLoader() {
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <div className="flex flex-col items-center gap-5" role="status" aria-live="polite">
        <div className="relative">
          <div className="absolute -inset-3 animate-pulse rounded-2xl bg-primary/10" />
          <BrandMark className="relative size-11" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">QueuePilot</p>
          <p className="text-xs text-muted-foreground">Restoring your workspace…</p>
        </div>
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
