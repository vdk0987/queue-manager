import { z } from "zod";

/**
 * Queue names are trimmed and internal runs of whitespace are collapsed so
 * "Priority   Consultation" and "Priority Consultation" are stored the same.
 */
const queueName = z
  .string()
  .trim()
  .min(1, "Queue name is required.")
  .max(100, "Queue name must be 100 characters or fewer.")
  .transform((value) => value.replace(/\s+/g, " "));

export const createQueueSchema = z.object({
  name: queueName,
});

export const updateQueueSchema = z
  .object({
    name: queueName.optional(),
  })
  .refine((value) => value.name !== undefined, {
    message: "Provide a queue name to update.",
    path: ["name"],
  });

export const updateQueueStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const queueIdParamsSchema = z.object({
  id: z.uuid("Enter a valid queue ID."),
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
export type UpdateQueueStatusInput = z.infer<typeof updateQueueStatusSchema>;
