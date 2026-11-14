import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ListOrdered } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { getErrorMessage, getFieldErrors, queueApi } from "@/lib/api";
import type { Queue } from "@/types/queue";

const queueNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Queue name is required.")
    .max(100, "Queue name must be 100 characters or fewer."),
});

type QueueNameValues = z.infer<typeof queueNameSchema>;

interface QueueFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  queue?: Queue;
  onSaved: (queue: Queue) => void;
}

export function QueueFormDialog({
  open,
  onOpenChange,
  mode,
  queue,
  onSaved,
}: QueueFormDialogProps) {
  const isEdit = mode === "edit";
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<QueueNameValues>({
    resolver: zodResolver(queueNameSchema),
    defaultValues: { name: "" },
    mode: "onTouched",
  });

  const name = watch("name") ?? "";

  useEffect(() => {
    if (!open) return;

    reset({ name: queue?.name ?? "" });
    setServerError(null);
    clearErrors();
  }, [open, queue, reset, clearErrors]);

  async function onSubmit(values: QueueNameValues) {
    setServerError(null);

    try {
      const response =
        isEdit && queue
          ? await queueApi.rename(queue.id, { name: values.name })
          : await queueApi.create({ name: values.name });

      toast.success(isEdit ? "Queue renamed." : "Queue created.");
      onSaved(response.data);
      onOpenChange(false);
    } catch (error) {
      const fieldErrors = getFieldErrors(error);
      const nameError = fieldErrors.name?.[0];

      if (nameError) {
        setError("name", { type: "server", message: nameError });
        return;
      }

      setServerError(getErrorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent
        onEscapeKeyDown={(event) => isSubmitting && event.preventDefault()}
        onPointerDownOutside={(event) => isSubmitting && event.preventDefault()}
      >
        <div className="space-y-2 pr-8">
          <DialogTitle>{isEdit ? "Rename queue" : "Create a queue"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Give this queue a new name. Existing participants keep their place."
              : "Name the line your team will manage. You can rename it at any time."}
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
              <Label htmlFor="queue-name">Queue name</Label>
              <span className="text-[0.6875rem] text-muted-foreground">{name.length}/100</span>
            </div>
            <div className="relative">
              <ListOrdered className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                id="queue-name"
                autoFocus
                maxLength={100}
                placeholder="General Consultation"
                className="pl-10"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "queue-name-error" : "queue-name-hint"}
                {...register("name")}
              />
            </div>
            {errors.name ? (
              <p id="queue-name-error" className="text-xs font-medium text-destructive">
                {errors.name.message}
              </p>
            ) : (
              <p id="queue-name-hint" className="text-xs text-muted-foreground">
                Use a name your team will recognise at a glance.
              </p>
            )}
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
              {isSubmitting ? <Spinner label={isEdit ? "Saving queue" : "Creating queue"} /> : null}
              {isEdit ? "Save changes" : "Create queue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
