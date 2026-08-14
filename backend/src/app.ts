import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import { registerSafeErrorHandling } from "./http/api-errors.js";
import { registerSameOriginMutationProtection } from "./http/security.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { registerHealthRoute, type ReadinessProbe } from "./routes/health.js";
import { registerPipelineRoutes } from "./routes/pipeline.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerSessionRoutes } from "./routes/session.js";
import type { ApplicationDependencies } from "./runtime/dependencies.js";

export type BuildAppOptions = {
  dependencies: ApplicationDependencies;
  serverOptions?: FastifyServerOptions;
  staticRoot?: string;
  readinessProbe?: ReadinessProbe;
};

export function buildApp({
  dependencies,
  serverOptions = {},
  staticRoot,
  readinessProbe,
}: BuildAppOptions) {
  const app = Fastify({
    bodyLimit: dependencies.config.MAX_SOURCE_BYTES + 64 * 1_024,
    ...serverOptions,
  });
  registerSafeErrorHandling(app, { spaFallback: Boolean(staticRoot) });
  registerSameOriginMutationProtection(app);
  void app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: false,
  });
  void app.register(cookie);
  void app.register(multipart, {
    limits: {
      fileSize: dependencies.config.MAX_SOURCE_BYTES,
      files: 2,
      fields: 4,
      parts: 6,
    },
  });
  void app.register(registerHealthRoute, { dependencies, readinessProbe });
  void app.register(registerSessionRoutes, { dependencies });
  void app.register(registerProjectRoutes, { dependencies });
  void app.register(registerPipelineRoutes, { dependencies });
  void app.register(registerArtifactRoutes, { dependencies });
  if (staticRoot) {
    void app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      wildcard: false,
      index: false,
      redirect: false,
      cacheControl: false,
      dotfiles: "deny",
      setHeaders(response, pathName) {
        if (pathName.endsWith("index.html")) {
          response.header("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (pathName.includes("/assets/")) {
          response.header("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          response.header("Cache-Control", "public, max-age=3600");
        }
        response.header("X-Content-Type-Options", "nosniff");
      },
    });
  }
  app.addHook("onClose", async () => {
    dependencies.heartbeatScheduler.close?.();
    if (dependencies.database.open) dependencies.database.close();
  });
  return app;
}
