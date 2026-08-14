import {
  ProjectStepRouteParamsSchema,
  RunProjectStepRequestSchema,
  type StepActionResponse,
} from "@gradion-folio/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireSession } from "../identity/session-service.js";
import {
  recoverProjectStep,
  runProjectStep,
} from "../pipeline/pipeline-service.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";

function authenticatedUserId(
  request: FastifyRequest,
  dependencies: ApplicationDependencies,
): string {
  return requireSession(
    dependencies,
    request.cookies[dependencies.config.COOKIE_NAME],
  ).user.id;
}

export async function registerPipelineRoutes(
  app: FastifyInstance,
  { dependencies }: { dependencies: ApplicationDependencies },
) {
  app.post(
    "/api/projects/:projectId/steps/:ordinal/run",
    async (request, reply): Promise<StepActionResponse> => {
      const userId = authenticatedUserId(request, dependencies);
      const { projectId, ordinal } = ProjectStepRouteParamsSchema.parse(request.params);
      const input = RunProjectStepRequestSchema.parse(request.body ?? {});
      const result = await runProjectStep(
        dependencies,
        userId,
        projectId,
        ordinal,
        input,
      );
      reply.code(result.statusCode);
      return { disposition: result.disposition, project: result.project };
    },
  );

  app.post(
    "/api/projects/:projectId/steps/:ordinal/recover",
    async (request, reply): Promise<StepActionResponse> => {
      const userId = authenticatedUserId(request, dependencies);
      const { projectId, ordinal } = ProjectStepRouteParamsSchema.parse(request.params);
      const result = recoverProjectStep(dependencies, userId, projectId, ordinal);
      reply.code(result.statusCode);
      return { disposition: result.disposition, project: result.project };
    },
  );
}
