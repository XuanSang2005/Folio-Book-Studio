import { buildApp } from "./app.js";
import { parseEnvironment } from "./config/env.js";
import { loadLocalEnvironment } from "./config/load-env.js";
import { createRuntimeDependencies } from "./runtime/dependencies.js";

const config = parseEnvironment(await loadLocalEnvironment());
const dependencies = createRuntimeDependencies(config);
const app = buildApp({
  dependencies,
  serverOptions: {
    logger: { level: config.LOG_LEVEL },
  },
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
