import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const applications: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe("GET /api/health", () => {
  it("reports that the backend foundation is available", async () => {
    const app = buildApp();
    applications.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
