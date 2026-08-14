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
});
