import type { ApiErrorCode, ApiErrorEnvelope } from "@gradion-folio/contracts";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { SourceValidationError } from "../storage/local-file-store.js";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "request";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

function envelope(error: ApiError): ApiErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    },
  };
}

export function registerSafeErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send(envelope(new ApiError(404, "NOT_FOUND", "Resource not found.")));
    }
    return reply.code(404).send({ message: "Not Found" });
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(envelope(error));
    }
    if (error instanceof ZodError) {
      const validation = new ApiError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
        zodFieldErrors(error),
      );
      return reply.code(400).send(envelope(validation));
    }
    if (error instanceof SourceValidationError) {
      const validation = new ApiError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
        { [error.field]: [error.message] },
      );
      return reply.code(400).send(envelope(validation));
    }
    const errorDetails = typeof error === "object" && error !== null
      ? error as { code?: string; statusCode?: number; name?: string }
      : {};
    if (
      errorDetails.code === "FST_REQ_FILE_TOO_LARGE"
      || errorDetails.code === "FST_FILES_LIMIT"
      || errorDetails.statusCode === 413
    ) {
      return reply.code(400).send(envelope(new ApiError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
        { source: ["Manuscript exceeds the configured upload limit."] },
      )));
    }
    if (
      errorDetails.statusCode
      && errorDetails.statusCode >= 400
      && errorDetails.statusCode < 500
    ) {
      return reply.code(400).send(envelope(new ApiError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
      )));
    }

    request.log.error({ errorName: errorDetails.name ?? "UnknownError" }, "Unhandled API request failure");
    return reply.code(500).send(envelope(new ApiError(
      500,
      "INTERNAL_ERROR",
      "The request could not be completed.",
    )));
  });
}

export function unauthenticated(): ApiError {
  return new ApiError(401, "UNAUTHENTICATED", "A valid session is required.");
}

export function projectNotFound(): ApiError {
  return new ApiError(404, "NOT_FOUND", "Project not found.");
}
