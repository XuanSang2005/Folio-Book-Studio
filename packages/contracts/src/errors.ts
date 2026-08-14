import { z } from "zod";

export const API_ERROR_CODES = [
  "INTERNAL_ERROR",
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "STEP_OUT_OF_ORDER",
  "STEP_ALREADY_RUNNING",
  "STEP_STUCK",
  "STEP_NOT_RECOVERABLE",
  "GEMINI_NOT_CONFIGURED",
  "MODEL_ACCESS_DENIED",
  "QUOTA_EXCEEDED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT_AMBIGUOUS",
  "SAFETY_BLOCKED",
  "NO_IMAGE",
  "UNSUPPORTED_IMAGE_TYPE",
  "INVALID_MODEL_OUTPUT",
  "CONTEXT_EXPIRED",
  "LOCAL_IO_ERROR",
  "PROCESS_INTERRUPTED",
] as const;

export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
  fieldErrors: z.record(z.string(), z.array(z.string().min(1))).optional(),
});

export const ApiErrorEnvelopeSchema = z.object({
  error: ApiErrorSchema,
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
