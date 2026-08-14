import type { HealthResponse } from "@gradion-folio/contracts";
import type { FastifyInstance } from "fastify";
import type { ApplicationDependencies } from "../runtime/dependencies.js";

export async function registerHealthRoute(
  app: FastifyInstance,
  _options: { dependencies: ApplicationDependencies },
) {
  void _options;
  app.get("/api/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
}
