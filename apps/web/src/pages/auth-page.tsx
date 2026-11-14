import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Circle,
  Clock3,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/api";
import { getSafeRedirect, type RedirectLocation } from "@/lib/navigation";
import { cn, getFirstName } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password."),
});

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120, "Name must be 120 characters or fewer."),
    email: z
      .string()
      .trim()
      .min(1, "Enter your email address.")
      .pipe(z.email("Enter a valid email address.")),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Use 72 characters or fewer.")
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/[0-9]/, "Include at least one number."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

interface AuthPageProps {
  mode: "login" | "register";
}

export function AuthPage({ mode }: AuthPageProps) {
  const isLogin = mode === "login";

  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
      <AuthAside />

      <main className="relative flex min-h-svh flex-col px-5 py-7 sm:px-8 lg:min-h-0 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between lg:hidden">
          <Logo showTagline />
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground shadow-xs">
            Phase 2
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-[27rem] flex-1 flex-col justify-center py-10 lg:py-8">
          <div className="animate-fade-up">
            <div className="mb-7 flex flex-col gap-3">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground shadow-xs">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
                Secure manager access
              </span>

              <div className="space-y-2.5">
                <h1 className="text-[1.9rem] font-bold leading-[1.1] text-foreground sm:text-[2.15rem]">
                  {isLogin ? "Welcome back." : "Create your workspace."}
                </h1>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
                  {isLogin
                    ? "Sign in to your QueuePilot workspace and pick up right where you left off."
                    : "Set up your manager account. Your queues, tokens and analytics will live here."}
                </p>
              </div>
            </div>

            <AuthModeSwitch mode={mode} />

            <div className="mt-6">{isLogin ? <LoginForm /> : <RegisterForm />}</div>

            <p className="mt-7 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              Protected by an HttpOnly session cookie
            </p>
          </div>
        </div>

        <footer className="flex flex-col items-center justify-between gap-2 border-t border-border/70 pt-5 text-[0.6875rem] text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} QueuePilot</span>
          <span className="font-medium uppercase tracking-[0.12em]">
            Manager workspace · Phase 2
          </span>
        </footer>
      </main>
    </div>
  );
}

function AuthModeSwitch({ mode }: { mode: "login" | "register" }) {
  return (
    <nav
      aria-label="Authentication"
      className="grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/60 p-1"
    >
      <Link
        to="/login"
        aria-current={mode === "login" ? "page" : undefined}
        className={cn(
          "rounded-lg px-3 py-2 text-center text-sm font-medium transition-all focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none",
          mode === "login"
            ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Sign in
      </Link>
      <Link
        to="/register"
        aria-current={mode === "register" ? "page" : undefined}
        className={cn(
          "rounded-lg px-3 py-2 text-center text-sm font-medium transition-all focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none",
          mode === "register"
            ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Create account
      </Link>
    </nav>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const state = location.state as { from?: RedirectLocation } | null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  async function onSubmit(values: LoginValues) {
    setServerError(null);

    try {
      const manager = await login(values);
      toast.success(`Welcome back, ${getFirstName(manager.name)}.`);
      navigate(getSafeRedirect(state?.from), { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError ? (
        <Alert variant="destructive" className="animate-fade-in">
          <AlertCircle />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            className="pl-10"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
        </div>
        <FieldError id="email-error" message={errors.email?.message} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <span className="text-[0.6875rem] text-muted-foreground">Case-sensitive</span>
        </div>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            className="pl-10"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
        </div>
        <FieldError id="password-error" message={errors.password?.message} />
      </div>

      <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner label="Signing in" />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight />
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        New to QueuePilot?{" "}
        <Link
          to="/register"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

function RegisterForm() {
  const { register: registerManager } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    mode: "onTouched",
  });

  const password = watch("password") ?? "";
  const requirements = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "One letter", met: /[A-Za-z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
  ];

  async function onSubmit(values: RegisterValues) {
    setServerError(null);

    try {
      const manager = await registerManager({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      toast.success(`Workspace ready. Welcome, ${getFirstName(manager.name)}.`);
      navigate("/", { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError ? (
        <Alert variant="destructive" className="animate-fade-in">
          <AlertCircle />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            placeholder="Ada Lovelace"
            className="pl-10"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "name-error" : undefined}
            {...register("name")}
          />
        </div>
        <FieldError id="name-error" message={errors.name?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-email">Email address</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            id="register-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="pl-10"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "register-email-error" : undefined}
            {...register("email")}
          />
        </div>
        <FieldError id="register-email-error" message={errors.email?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password">Password</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <PasswordInput
            id="register-password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            className="pl-10"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={
              errors.password
                ? "register-password-error password-requirements"
                : "password-requirements"
            }
            {...register("password")}
          />
        </div>
        <FieldError id="register-password-error" message={errors.password?.message} />
        <ul
          id="password-requirements"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5"
        >
          {requirements.map((requirement) => (
            <li
              key={requirement.label}
              className={cn(
                "flex items-center gap-1.5 text-[0.6875rem] font-medium transition-colors",
                requirement.met ? "text-emerald-700" : "text-muted-foreground",
              )}
            >
              {requirement.met ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                <Circle className="size-3" aria-hidden="true" />
              )}
              {requirement.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            className="pl-10"
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
            {...register("confirmPassword")}
          />
        </div>
        <FieldError id="confirm-password-error" message={errors.confirmPassword?.message} />
      </div>

      <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner label="Creating account" />
            Creating workspace…
          </>
        ) : (
          <>
            Create account
            <ArrowRight />
          </>
        )}
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        You&apos;re creating a manager account. Queue participants don&apos;t need one.
      </p>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden bg-[#100f1d] text-white lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:justify-between lg:p-11 xl:p-14">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.32),transparent_44%),radial-gradient(circle_at_85%_82%,rgba(16,185,129,0.18),transparent_38%)]"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-auth-grid opacity-60" />
      <div
        aria-hidden="true"
        className="absolute -left-28 top-1/3 size-80 rounded-full bg-indigo-500/15 blur-3xl"
      />

      <div className="relative z-10">
        <Logo tone="dark" showTagline />
      </div>

      <div className="relative z-10 my-8 max-w-[29rem]">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-indigo-100/80 backdrop-blur">
          <Sparkles className="size-3 text-emerald-300" />
          Manager workspace
        </span>

        <h2 className="mt-6 text-[2.6rem] font-bold leading-[1.06] tracking-[-0.035em] xl:text-[3.15rem]">
          Every line,
          <br />
          <span className="text-gradient">in its place.</span>
        </h2>

        <p className="mt-5 max-w-md text-[0.9375rem] leading-relaxed text-indigo-100/65">
          QueuePilot turns the daily rush into a calm, ordered flow — so your team can focus on
          people, not paperwork.
        </p>

        <div aria-hidden="true" className="mt-10 max-w-[26rem]">
          <div className="animate-float rounded-3xl border border-white/10 bg-white/[0.055] p-3.5 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-center justify-between px-1 pb-3 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-white/50">
              <span>Live queue</span>
              <span className="flex items-center gap-1.5 text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Updating
              </span>
            </div>

            <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-lg shadow-black/20">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Now serving
                  </p>
                  <p className="mt-1 font-display text-[1.75rem] font-bold tracking-tight">
                    Q001-014
                  </p>
                </div>
                <div className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-md">
                  MC
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div>
                  <p className="text-sm font-semibold">Maya Chen</p>
                  <p className="text-[0.6875rem] text-slate-400">Counter 02</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[0.625rem] font-semibold text-emerald-700">
                  <Clock3 className="size-3" />
                  04:12
                </span>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2.5">
              {["015", "016", "017"].map((token, index) => (
                <div
                  key={token}
                  className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5 backdrop-blur"
                >
                  <p className="text-[0.5625rem] font-medium uppercase tracking-[0.12em] text-white/40">
                    #{index + 1} in line
                  </p>
                  <p className="mt-0.5 font-display text-sm font-semibold text-white/90">
                    Q001-{token}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.045] px-3.5 py-2.5 text-[0.6875rem] text-white/55 backdrop-blur">
              <span>Average wait today</span>
              <span className="font-semibold text-white">6m 20s</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-wrap gap-x-5 gap-y-2 text-[0.6875rem] font-medium text-indigo-100/50">
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-3 text-emerald-300" /> Manager-only access
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-3 text-emerald-300" /> FIFO by default
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-3 text-emerald-300" /> Every action saved
        </span>
      </div>
    </aside>
  );
}
