import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/env.js";
import { GoogleGeminiGateway } from "../src/integrations/gemini/google-gemini-gateway.js";
import { GeminiStepExecutor } from "../src/pipeline/gemini-step-executor.js";
import { UnconfiguredStepExecutor } from "../src/pipeline/step-executor.js";
import { createRuntimeDependencies } from "../src/runtime/dependencies.js";

describe("runtime provider composition", () => {
  it("starts keyless and composes the real adapter only for a backend key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gradion-runtime-dependencies-"));
    const environment = (key?: string) => parseEnvironment({
      NODE_ENV: "test",
      DATA_DIR: join(directory, key ? "keyed-data" : "keyless-data"),
      DATABASE_PATH: join(directory, key ? "keyed.sqlite" : "keyless.sqlite"),
      ...(key ? { GEMINI_API_KEY: key } : {}),
    });
    const keyless = createRuntimeDependencies(environment());
    const keyed = createRuntimeDependencies(environment("backend-test-key"));

    try {
      expect(keyless.stepExecutor).toBeInstanceOf(UnconfiguredStepExecutor);
      expect(keyed.gemini).toBeInstanceOf(GoogleGeminiGateway);
      expect(keyed.stepExecutor).toBeInstanceOf(GeminiStepExecutor);
      expect(JSON.stringify(keyless.config)).not.toContain("backend-test-key");
    } finally {
      keyless.database.close();
      keyed.database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
