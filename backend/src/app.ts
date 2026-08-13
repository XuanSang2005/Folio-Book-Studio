import Fastify, { type FastifyServerOptions } from "fastify";
import { registerHealthRoute } from "./routes/health.js";

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  void app.register(registerHealthRoute);
  return app;
}
