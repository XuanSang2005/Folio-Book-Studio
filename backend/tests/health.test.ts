import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("GET /api/health", () => {
  it("reports that the explicitly configured backend foundation is available", async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = "ambient-invalid-port";

    try {
      const harness = await createTestHarness();
      harnesses.push(harness);
      const response = await harness.app.inject({ method: "GET", url: "/api/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    } finally {
      if (originalPort === undefined) delete process.env.PORT;
      else process.env.PORT = originalPort;
    }
  });

  it("keeps compatibility health and exposes a minimal liveness response", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);

    const [health, live] = await Promise.all([
      harness.app.inject({ method: "GET", url: "/api/health" }),
      harness.app.inject({ method: "GET", url: "/api/health/live" }),
    ]);

    expect(health.statusCode).toBe(200);
    expect(live.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
    expect(live.json()).toEqual({ status: "ok" });
  });

  it.each([
    [undefined, false],
    ["configured-placeholder-key", true],
  ])("reports readiness without exposing Gemini configuration (%s)", async (key, configured) => {
    const harness = await createTestHarness({
      environment: { ...(key ? { GEMINI_API_KEY: key } : {}) },
    });
    harnesses.push(harness);

    const response = await harness.app.inject({ method: "GET", url: "/api/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ready",
      checks: { database: "ok", migrations: "ok", dataDirectory: "ok" },
      geminiConfigured: configured,
    });
    expect(response.body).not.toContain(key ?? "GEMINI_API_KEY");
  });

  it("reports not ready when the isolated database is closed", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    harness.database.close();

    const response = await harness.app.inject({ method: "GET", url: "/api/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "not_ready",
      checks: { database: "error", migrations: "error" },
    });
  });

  it("reports not ready when the isolated data path cannot be a directory", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "gradion-readiness-test-"));
    const blockedDataPath = join(temporaryDirectory, "blocked-data-path");
    await writeFile(blockedDataPath, "not a directory", "utf8");
    const harness = await createTestHarness({
      temporaryDirectory,
      environment: {
        DATA_DIR: blockedDataPath,
        DATABASE_PATH: join(temporaryDirectory, "folio.sqlite"),
      },
    });

    try {
      const response = await harness.app.inject({ method: "GET", url: "/api/health/ready" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        status: "not_ready",
        checks: { database: "ok", migrations: "ok", dataDirectory: "error" },
      });
    } finally {
      await harness.cleanup();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("reports not ready when an expected migration record is missing", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    harness.database.prepare("DELETE FROM schema_migrations WHERE version = 3").run();

    const response = await harness.app.inject({ method: "GET", url: "/api/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "not_ready",
      checks: { database: "ok", migrations: "error", dataDirectory: "ok" },
    });
  });
});
