import { z } from "zod";

/** Participant names keep intentional spacing but collapse accidental runs. */
const participantName = z
  .string()
  .trim()
  .min(1, "Participant name is required.")
  .max(100, "Participant name must be 100 characters or fewer.")
  .transform((value) => value.replace(/\s+/g, " "));

const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const contactNumber = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .min(5, "Contact number is too short.")
    .max(32, "Contact number must be 32 characters or fewer.")
    .regex(
      /^[+()\d\s.-]+$/,
      "Use only digits, spaces, and the symbols + ( ) - . in a contact number.",
    )
    .optional(),
);

const notes = z.preprocess(
  blankToUndefined,
  z.string().trim().max(500, "Notes must be 500 characters or fewer.").optional(),
);

export const createTokenSchema = z.object({
  participantName,
  contactNumber,
  notes,
});

export const reorderTokenSchema = z.object({
  direction: z.enum(["UP", "DOWN"], {
    message: "Choose whether to move the token UP or DOWN.",
  }),
});

export const queueTokenQuerySchema = z.object({
  status: z
    .enum(["WAITING", "IN_SERVICE", "COMPLETED", "CANCELLED", "ALL"], {
      message: "Choose a valid token status filter.",
    })
    .optional(),
});

export const queueIdParamsSchema = z.object({
  id: z.uuid("Enter a valid queue ID."),
});

export const tokenIdParamsSchema = z.object({
  id: z.uuid("Enter a valid token ID."),
});

export type CreateTokenInput = z.infer<typeof createTokenSchema>;
export type ReorderTokenInput = z.infer<typeof reorderTokenSchema>;
export type QueueTokenQuery = z.infer<typeof queueTokenQuerySchema>;
