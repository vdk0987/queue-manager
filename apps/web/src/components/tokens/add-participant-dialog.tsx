import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Copy, Hash, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, getFieldErrors, tokenApi } from "@/lib/api";
import type { Token } from "@/types/token";

const participantSchema = z.object({
  participantName: z
    .string()
    .trim()
    .min(1, "Participant name is required.")
    .max(100, "Participant name must be 100 characters or fewer."),
  contactNumber: z
    .string()
    .trim()
    .max(32, "Contact number must be 32 characters or fewer.")
    .refine(
      (value) =>
        value === "" || (/^[+()\d\s.-]+$/.test(value) && value.replace(/\D/g, "").length >= 5),
      "Enter at least 5 digits using only + ( ) - . and spaces.",
    ),
  notes: z.string().trim().max(500, "Notes must be 500 characters or fewer."),
});

type ParticipantValues = z.infer<typeof participantSchema>;

interface AddParticipantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueId: string;
  queueName: string;
  onRegistered: (token: Token) => void;
}

export function AddParticipantDialog({
  open,
  onOpenChange,
  queueId,
  queueName,
  onRegistered,
}: AddParticipantDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Token | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ParticipantValues>({
    resolver: zodResolver(participantSchema),
    defaultValues: { participantName: "", contactNumber: "", notes: "" },
    mode: "onTouched",
  });

  const name = watch("participantName") ?? "";
  const notes = watch("notes") ?? "";

  useEffect(() => {
    if (!open) return;

    reset({ participantName: "", contactNumber: "", notes: "" });
    setServerError(null);
    setGenerated(null);
    setCopied(false);
    clearErrors();
  }, [open, reset, clearErrors]);

  async function onSubmit(values: ParticipantValues) {
    setServerError(null);

    try {
      const response = await tokenApi.register(queueId, {
        participantName: values.participantName,
        contactNumber: values.contactNumber || undefined,
        notes: values.notes || undefined,
      });

      setGenerated(response.data);
      toast.success(`Token ${response.data.displayToken} generated.`);
      onRegistered(response.data);
    } catch (error) {
      const fieldErrors = getFieldErrors(error);
      let mappedField = false;

      for (const field of ["participantName", "contactNumber", "notes"] as const) {
        const message = fieldErrors[field]?.[0];

        if (message) {
          setError(field, { type: "server", message });
          mappedField = true;
        }
      }

      if (!mappedField) {
        setServerError(getErrorMessage(error));
      }
    }
  }

  async function copyToken() {
    if (!generated) return;

    try {
      await navigator.clipboard.writeText(generated.displayToken);
      setCopied(true);
      toast.success("Token copied to your clipboard.");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Clipboard access is unavailable in this browser.");
    }
  }

  function addAnother() {
    setGenerated(null);
    setCopied(false);
    setServerError(null);
    reset({ participantName: "", contactNumber: "", notes: "" });
    clearErrors();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent
        onEscapeKeyDown={(event) => isSubmitting && event.preventDefault()}
        onPointerDownOutside={(event) => isSubmitting && event.preventDefault()}
      >
        {generated ? (
          <>
            <div className="space-y-2 pr-8">
              <DialogTitle>Token generated</DialogTitle>
              <DialogDescription>
                {generated.participantName} has been added to {queueName}.
              </DialogDescription>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-200/80 bg-emerald-50/45 px-5 py-6 text-center">
              <Badge variant="success">
                <CheckCircle2 />
                Token generated
              </Badge>

              <div className="mt-4 flex items-center justify-center gap-2">
                <p className="font-display text-4xl font-bold tracking-tight text-foreground">
                  {generated.displayToken}
                </p>
                <button
                  type="button"
                  onClick={() => void copyToken()}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none"
                  aria-label="Copy generated token"
                >
                  {copied ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>

              <p className="mt-1 text-sm font-semibold text-foreground">
                {generated.participantName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Added to the waiting queue</p>

              <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-card px-3 py-1 text-xs font-medium text-foreground shadow-xs">
                <Hash className="size-3.5 text-emerald-600" />
                Position {generated.position}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={addAnother}>
                <UserPlus />
                Add another
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-2 pr-8">
              <DialogTitle>Add participant</DialogTitle>
              <DialogDescription>
                Register someone in {queueName}. A unique token is generated automatically and
                appended to the end of the waiting list.
              </DialogDescription>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
              {serverError ? (
                <Alert variant="destructive" className="animate-fade-in">
                  <AlertCircle />
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="participant-name">Participant name</Label>
                  <span className="text-[0.6875rem] text-muted-foreground">{name.length}/100</span>
                </div>
                <Input
                  id="participant-name"
                  autoFocus
                  maxLength={100}
                  placeholder="John Doe"
                  aria-invalid={Boolean(errors.participantName)}
                  aria-describedby={
                    errors.participantName ? "participant-name-error" : "participant-name-hint"
                  }
                  {...register("participantName")}
                />
                {errors.participantName ? (
                  <p id="participant-name-error" className="text-xs font-medium text-destructive">
                    {errors.participantName.message}
                  </p>
                ) : (
                  <p id="participant-name-hint" className="text-xs text-muted-foreground">
                    This is the name your team will call out.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="participant-contact">
                  Contact number{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="participant-contact"
                  inputMode="tel"
                  maxLength={32}
                  placeholder="9876543210"
                  aria-invalid={Boolean(errors.contactNumber)}
                  aria-describedby={errors.contactNumber ? "participant-contact-error" : undefined}
                  {...register("contactNumber")}
                />
                {errors.contactNumber ? (
                  <p
                    id="participant-contact-error"
                    className="text-xs font-medium text-destructive"
                  >
                    {errors.contactNumber.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="participant-notes">
                    Notes <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <span className="text-[0.6875rem] text-muted-foreground">{notes.length}/500</span>
                </div>
                <Textarea
                  id="participant-notes"
                  maxLength={500}
                  rows={3}
                  placeholder="General consultation"
                  aria-invalid={Boolean(errors.notes)}
                  aria-describedby={errors.notes ? "participant-notes-error" : undefined}
                  {...register("notes")}
                />
                {errors.notes ? (
                  <p id="participant-notes-error" className="text-xs font-medium text-destructive">
                    {errors.notes.message}
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Spinner label="Generating token" /> : <UserPlus />}
                  Generate token
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
