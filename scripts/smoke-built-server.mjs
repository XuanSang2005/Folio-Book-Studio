import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = process.env.BASE_URL;
const dataDirectory = process.env.SMOKE_DATA_DIR;
if (!baseUrl || !dataDirectory) {
  throw new Error("BASE_URL and SMOKE_DATA_DIR are required for the built-server smoke test.");
}

const privateSentinel = "PHASE5-PRIVATE-DATA-MUST-NOT-BE-SERVED";
await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
await writeFile(join(dataDirectory, "private-smoke.txt"), privateSentinel, {
  encoding: "utf8",
  mode: 0o600,
});

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health/live`);
      if (response.ok) return;
      lastError = new Error(`Liveness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw lastError ?? new Error("Built server did not become ready.");
}

async function expectJson(path, status, verify) {
  const response = await fetch(`${baseUrl}${path}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== status || !contentType.includes("application/json")) {
    throw new Error(`${path} returned ${response.status} ${contentType}`);
  }
  const body = await response.json();
  verify(body);
}

async function expectSpa(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.text();
  if (
    response.status !== 200
    || !(response.headers.get("content-type") ?? "").includes("text/html")
    || !body.includes('<div id="root"></div>')
  ) {
    throw new Error(`${path} did not return the built SPA entry point.`);
  }
  if ((response.headers.get("cache-control") ?? "").includes("immutable")) {
    throw new Error(`${path} returned an immutable index.html policy.`);
  }
}

await waitForServer();
await expectJson("/api/health", 200, (body) => {
  if (body.status !== "ok") throw new Error("Compatibility health check failed.");
});
await expectJson("/api/health/live", 200, (body) => {
  if (body.status !== "ok") throw new Error("Liveness check failed.");
});
await expectJson("/api/health/ready", 200, (body) => {
  if (body.status !== "ready" || body.geminiConfigured !== false) {
    throw new Error("Keyless readiness check failed.");
  }
  if (Object.values(body.checks ?? {}).some((value) => value !== "ok")) {
    throw new Error("One or more readiness dependencies failed.");
  }
});

for (const path of [
  "/library",
  "/volumes/new",
  "/volumes/00000000-0000-4000-8000-000000000001",
]) {
  await expectSpa(path);
}

await expectJson("/api/phase5-unknown", 404, (body) => {
  if (body.error?.code !== "NOT_FOUND") throw new Error("API 404 was not typed JSON.");
});

const privateResponse = await fetch(`${baseUrl}/data/private-smoke.txt`);
const privateBody = await privateResponse.text();
if (privateBody.includes(privateSentinel)) {
  throw new Error("Private data was exposed through static serving.");
}

console.log(`Built-server smoke passed at ${baseUrl}`);

