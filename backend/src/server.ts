import { buildApp } from "./app.js";
import { parseEnvironment } from "./config/env.js";
import { loadLocalEnvironment } from "./config/load-env.js";
import { FRONTEND_DIST_DIR } from "./config/paths.js";
import { createSafeLoggerOptions } from "./http/logging.js";
import { createRuntimeDependencies } from "./runtime/dependencies.js";
import { registerProductionShutdown } from "./runtime/shutdown.js";

const config = parseEnvironment(await loadLocalEnvironment());
const dependencies = createRuntimeDependencies(config);
const app = buildApp({
  dependencies,
  serverOptions: {
    logger: createSafeLoggerOptions(config),
  },
  ...(config.NODE_ENV === "production" ? { staticRoot: FRONTEND_DIST_DIR } : {}),
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  registerProductionShutdown(app);
} catch (error) {
  app.log.error({ err: error }, "Server startup failed");
  await app.close();
  process.exitCode = 1;
}
