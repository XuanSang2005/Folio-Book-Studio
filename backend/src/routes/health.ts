import type { FastifyInstance } from "fastify";

export async function registerHealthRoute(app: FastifyInstance) {
  app.get("/api/health", async () => ({ status: "ok" as const }));
}
