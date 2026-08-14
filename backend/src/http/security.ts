import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "./api-errors.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestOrigin(request: FastifyRequest): string | undefined {
  const value = request.headers.origin;
  return Array.isArray(value) ? value[0] : value;
}

function isSameOrigin(request: FastifyRequest, origin: string): boolean {
  const host = request.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).origin === new URL(`${request.protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

export function registerSameOriginMutationProtection(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    if (!MUTATING_METHODS.has(request.method)) return;
    const origin = requestOrigin(request);
    if (origin === undefined) return;
    if (!isSameOrigin(request, origin)) {
      throw new ApiError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "Cross-origin mutation requests are not allowed.",
      );
    }
  });
}

