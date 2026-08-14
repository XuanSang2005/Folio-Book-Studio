import type { FastifyInstance } from "fastify";

export type ShutdownSignal = "SIGINT" | "SIGTERM";

export function createGracefulShutdown(
  app: FastifyInstance,
  options: {
    timeoutMs?: number;
    forceExit?: (code: number) => void;
  } = {},
) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const forceExit = options.forceExit ?? ((code: number) => process.exit(code));
  let shutdown: Promise<void> | undefined;

  return (signal: ShutdownSignal): Promise<void> => {
    if (shutdown) return shutdown;
    shutdown = (async () => {
      app.log.info({ signal }, "Shutdown requested");
      const timeout = setTimeout(() => {
        app.log.error({ signal, timeoutMs }, "Graceful shutdown timed out");
        forceExit(1);
      }, timeoutMs);
      timeout.unref();
      try {
        await app.close();
        app.log.info({ signal }, "Shutdown complete");
      } catch (error) {
        app.log.error({ err: error, signal }, "Graceful shutdown failed");
        process.exitCode = 1;
      } finally {
        clearTimeout(timeout);
      }
    })();
    return shutdown;
  };
}

export function registerProductionShutdown(app: FastifyInstance): void {
  const shutdown = createGracefulShutdown(app);
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

