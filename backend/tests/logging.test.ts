import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createSafeLoggerOptions } from "../src/http/logging.js";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("safe structured logging", () => {
  it("redacts secrets and content while retaining operational identifiers", async () => {
    let captured = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        captured += chunk.toString();
        callback();
      },
    });
    const harness = await createTestHarness({
      environment: { LOG_LEVEL: "info", GEMINI_API_KEY: "gemini-key-secret" },
      serverOptions: {
        logger: createSafeLoggerOptions({ LOG_LEVEL: "info" }, stream),
      },
    });
    harnesses.push(harness);

    harness.app.log.info({
      projectId: "project-safe-id",
      ordinal: 3,
      attemptId: "attempt-safe-id",
      modelId: "model-safe-id",
      duration: 42,
      resultCode: "PROVIDER_UNAVAILABLE",
      GEMINI_API_KEY: "gemini-key-secret",
      apiKey: "x-goog-secret",
      token: "session-token-secret",
      manuscript: "full manuscript secret sentence",
      text: "pasted manuscript secret sentence",
      bytes: "uploaded-file-secret-bytes",
      base64: "base64-image-secret",
      prompt: "full provider prompt secret",
      rawProviderResponse: "raw provider response secret",
    }, "Pipeline operation");
    await harness.app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        authorization: "Bearer authorization-secret",
        cookie: "folio_session=cookie-secret",
        "x-goog-api-key": "header-api-key-secret",
      },
    });

    expect(captured).toContain("project-safe-id");
    expect(captured).toContain("attempt-safe-id");
    expect(captured).toContain("model-safe-id");
    expect(captured).toContain("[REDACTED]");
    for (const secret of [
      "gemini-key-secret",
      "x-goog-secret",
      "session-token-secret",
      "full manuscript secret sentence",
      "pasted manuscript secret sentence",
      "uploaded-file-secret-bytes",
      "base64-image-secret",
      "full provider prompt secret",
      "raw provider response secret",
      "authorization-secret",
      "cookie-secret",
      "header-api-key-secret",
    ]) {
      expect(captured).not.toContain(secret);
    }
  });
});

