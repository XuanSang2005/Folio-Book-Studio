import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { HealthResponse, ReadinessResponse } from "@gradion-folio/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { migrationsAreCurrent } from "../database/migrate.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";

export type ReadinessProbe = () => Promise<ReadinessResponse>;

async function databaseReady(dependencies: ApplicationDependencies): Promise<boolean> {
  try {
    if (!dependencies.database.open) return false;
    const result = dependencies.database.prepare("SELECT 1 AS ready").get() as {
      ready: number;
    };
    return result.ready === 1;
  } catch {
    return false;
  }
}

async function dataDirectoryReady(dependencies: ApplicationDependencies): Promise<boolean> {
  let probeDirectory: string | undefined;
  try {
    await mkdir(dependencies.config.DATA_DIR, { recursive: true, mode: 0o700 });
    probeDirectory = await mkdtemp(join(dependencies.config.DATA_DIR, ".readiness-"));
    return true;
  } catch {
    return false;
  } finally {
    if (probeDirectory) {
      await rm(probeDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export function createReadinessProbe(
  dependencies: ApplicationDependencies,
): ReadinessProbe {
  return async () => {
    const [database, dataDirectory] = await Promise.all([
      databaseReady(dependencies),
      dataDirectoryReady(dependencies),
    ]);
    let migrations = false;
    try {
      migrations = database && migrationsAreCurrent(dependencies.database);
    } catch {
      migrations = false;
    }
    const ready = database && migrations && dataDirectory;
    return {
      status: ready ? "ready" : "not_ready",
      checks: {
        database: database ? "ok" : "error",
        migrations: migrations ? "ok" : "error",
        dataDirectory: dataDirectory ? "ok" : "error",
      },
      geminiConfigured: Boolean(dependencies.config.GEMINI_API_KEY),
    };
  };
}

export async function registerHealthRoute(
  app: FastifyInstance,
  options: {
    dependencies: ApplicationDependencies;
    readinessProbe?: ReadinessProbe;
  },
) {
  app.get("/api/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
  app.get("/api/health/live", async (): Promise<HealthResponse> => ({ status: "ok" }));
  app.get("/api/health/ready", async (_request, reply: FastifyReply) => {
    const result = await (options.readinessProbe
      ?? createReadinessProbe(options.dependencies))();
    return reply.code(result.status === "ready" ? 200 : 503).send(result);
  });
}
