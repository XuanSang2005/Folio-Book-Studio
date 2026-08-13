import { buildApp } from "./app.js";
import { parseEnvironment } from "./config/env.js";

const environment = parseEnvironment();
const app = buildApp({ logger: true });

try {
  await app.listen({ host: "127.0.0.1", port: environment.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
