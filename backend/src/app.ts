import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyServerOptions } from "fastify";
import { registerSafeErrorHandling } from "./http/api-errors.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerPipelineRoutes } from "./routes/pipeline.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerSessionRoutes } from "./routes/session.js";
import type { ApplicationDependencies } from "./runtime/dependencies.js";

export type BuildAppOptions = {
  dependencies: ApplicationDependencies;
  serverOptions?: FastifyServerOptions;
};

export function buildApp({
  dependencies,
  serverOptions = {},
}: BuildAppOptions) {
  const app = Fastify({
    bodyLimit: dependencies.config.MAX_SOURCE_BYTES + 64 * 1_024,
    ...serverOptions,
  });
  registerSafeErrorHandling(app);
  void app.register(cookie);
  void app.register(multipart, {
    limits: {
      fileSize: dependencies.config.MAX_SOURCE_BYTES,
      files: 2,
      fields: 4,
      parts: 6,
    },
  });
  void app.register(registerHealthRoute, { dependencies });
  void app.register(registerSessionRoutes, { dependencies });
  void app.register(registerProjectRoutes, { dependencies });
  void app.register(registerPipelineRoutes, { dependencies });
  void app.register(registerArtifactRoutes, { dependencies });
  app.addHook("onClose", async () => {
    if (dependencies.database.open) dependencies.database.close();
  });
  return app;
}
