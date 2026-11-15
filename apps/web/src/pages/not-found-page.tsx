import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useAuth } from "@/providers/auth-provider";

export function NotFoundPage() {
  useDocumentTitle("Page not found");
  const { status } = useAuth();
  const destination = status === "authenticated" ? "/" : "/login";

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background px-5 py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.09),transparent_45%)]"
      />

      <div className="relative">
        <Logo showTagline />
      </div>

      <div className="relative flex flex-1 items-center justify-center py-16">
        <div className="max-w-md text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-card text-primary shadow-card">
            <Compass className="size-6" />
          </div>
          <p className="mt-6 font-display text-[4rem] font-bold leading-none tracking-[-0.05em] text-foreground/15">
            404
          </p>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
            This page isn&apos;t in the queue.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The page you were looking for may have moved or is no longer available.
          </p>
          <Button asChild className="mt-6">
            <Link to={destination}>
              <ArrowLeft />
              {status === "authenticated" ? "Back to overview" : "Back to sign in"}
            </Link>
          </Button>
        </div>
      </div>

      <p className="relative text-center text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
        QueuePilot
      </p>
    </div>
  );
}
