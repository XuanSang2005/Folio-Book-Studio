import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];
const temporaryDirectories: string[] = [];
const indexMarkup = "<!doctype html><html><body><div id=\"root\">Phase 5 SPA</div></body></html>";

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

async function createStaticRoot() {
  const root = await mkdtemp(join(tmpdir(), "gradion-static-test-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "assets"));
  await Promise.all([
    writeFile(join(root, "index.html"), indexMarkup, "utf8"),
    writeFile(join(root, "assets", "app-hash.js"), "console.log('safe asset')", "utf8"),
  ]);
  return root;
}

describe("built same-origin release runtime", () => {
  it.each([
    "/",
    "/library",
    "/volumes/new",
    "/volumes/00000000-0000-4000-8000-000000000001",
  ])("serves the SPA entry point for direct route %s", async (url) => {
    const harness = await createTestHarness({ staticRoot: await createStaticRoot() });
    harnesses.push(harness);

    const response = await harness.app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toBe(indexMarkup);
    expect(response.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(response.headers["cache-control"]).not.toContain("immutable");
  });

  it("keeps unknown API paths JSON-only instead of falling back to index.html", async () => {
    const harness = await createTestHarness({ staticRoot: await createStaticRoot() });
    harnesses.push(harness);

    const response = await harness.app.inject({ method: "GET", url: "/api/unknown" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found." },
    });
    expect(response.body).not.toContain("Phase 5 SPA");
  });

  it("never exposes private data through static serving", async () => {
    const staticRoot = await createStaticRoot();
    const harness = await createTestHarness({ staticRoot });
    harnesses.push(harness);
    const privateValue = "PRIVATE-MANUSCRIPT-CONTENT-MUST-NOT-LEAK";
    await writeFile(join(harness.config.DATA_DIR, "private-source.txt"), privateValue, "utf8");

    const response = await harness.app.inject({ method: "GET", url: "/data/private-source.txt" });

    expect(response.body).not.toContain(privateValue);
    expect(response.body).toBe(indexMarkup);
  });

  it("uses immutable caching only for hashed build assets", async () => {
    const harness = await createTestHarness({ staticRoot: await createStaticRoot() });
    harnesses.push(harness);

    const response = await harness.app.inject({ method: "GET", url: "/assets/app-hash.js" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets local-app security headers without enabling CORS", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);

    const response = await harness.app.inject({ method: "GET", url: "/api/health" });

    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["content-security-policy"]).not.toContain("upgrade-insecure-requests");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows same-origin and origin-less local mutations", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const payload = { name: "Local Reader", email: "reader@example.com" };

    const sameOrigin = await harness.app.inject({
      method: "POST",
      url: "/api/session",
      headers: { host: "localhost:3001", origin: "http://localhost:3001" },
      payload,
    });
    const localClient = await harness.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { name: "CLI Reader", email: "cli@example.com" },
    });

    expect(sameOrigin.statusCode).toBe(200);
    expect(localClient.statusCode).toBe(200);
  });

  it.each(["POST", "DELETE"] as const)(
    "rejects an explicit cross-origin %s with a typed response",
    async (method) => {
      const harness = await createTestHarness();
      harnesses.push(harness);

      const response = await harness.app.inject({
        method,
        url: "/api/session",
        headers: { host: "localhost:3001", origin: "https://attacker.example" },
        ...(method === "POST"
          ? { payload: { name: "Reader", email: "reader@example.com" } }
          : {}),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "Cross-origin mutation requests are not allowed.",
        },
      });
    },
  );
});

