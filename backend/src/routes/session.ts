import {
  CreateSessionRequestSchema,
  type EndSessionResponse,
  type SessionDto,
} from "@gradion-folio/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createSession,
  deleteSession,
  requireSession,
} from "../identity/session-service.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";

function cookieSettings(request: FastifyRequest) {
  return {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
    secure: request.protocol === "https",
  };
}

export async function registerSessionRoutes(
  app: FastifyInstance,
  { dependencies }: { dependencies: ApplicationDependencies },
) {
  app.post("/api/session", async (request, reply): Promise<SessionDto> => {
    const input = CreateSessionRequestSchema.parse(request.body);
    const session = createSession(dependencies, input);
    reply.setCookie(dependencies.config.COOKIE_NAME, session.token, {
      ...cookieSettings(request),
      maxAge: dependencies.config.SESSION_TTL_SECONDS,
      expires: new Date(session.dto.expiresAt),
    });
    return session.dto;
  });

  app.get("/api/session", async (request): Promise<SessionDto> => (
    requireSession(dependencies, request.cookies[dependencies.config.COOKIE_NAME])
  ));

  app.delete("/api/session", async (request, reply): Promise<EndSessionResponse> => {
    deleteSession(dependencies, request.cookies[dependencies.config.COOKIE_NAME]);
    reply.clearCookie(dependencies.config.COOKIE_NAME, cookieSettings(request));
    return { signedOut: true };
  });
}
