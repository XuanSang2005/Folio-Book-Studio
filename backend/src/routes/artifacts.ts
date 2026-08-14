import {
  ChapterArtifactRouteParamsSchema,
  CharacterArtifactRouteParamsSchema,
} from "@gradion-folio/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireSession } from "../identity/session-service.js";
import {
  getChapterIllustration,
  getCharacterPortrait,
} from "../projects/artifact-service.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";
import type { GatewayImage } from "../integrations/gemini/gateway.js";

function authenticatedUserId(
  request: FastifyRequest,
  dependencies: ApplicationDependencies,
): string {
  return requireSession(
    dependencies,
    request.cookies[dependencies.config.COOKIE_NAME],
  ).user.id;
}

function sendImage(reply: FastifyReply, image: GatewayImage) {
  reply.header("Content-Type", image.mimeType);
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Cache-Control", "private, max-age=31536000, immutable");
  return reply.send(Buffer.from(image.bytes));
}

export async function registerArtifactRoutes(
  app: FastifyInstance,
  { dependencies }: { dependencies: ApplicationDependencies },
) {
  app.get(
    "/api/projects/:projectId/characters/:characterId/portrait",
    async (request, reply) => {
      const userId = authenticatedUserId(request, dependencies);
      const { projectId, characterId } = CharacterArtifactRouteParamsSchema.parse(request.params);
      return sendImage(
        reply,
        await getCharacterPortrait(dependencies, userId, projectId, characterId),
      );
    },
  );

  app.get(
    "/api/projects/:projectId/chapters/:chapterId/illustration",
    async (request, reply) => {
      const userId = authenticatedUserId(request, dependencies);
      const { projectId, chapterId } = ChapterArtifactRouteParamsSchema.parse(request.params);
      return sendImage(
        reply,
        await getChapterIllustration(dependencies, userId, projectId, chapterId),
      );
    },
  );
}
