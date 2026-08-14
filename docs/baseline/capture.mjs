import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? "playwright";
const { chromium } = await import(playwrightModule);

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const phase = process.argv[2] ?? "after";
const outputDirectory = resolve(`docs/baseline/${phase}`);
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;

const [molePortrait, rattyPortrait, riverbankPlate] = await Promise.all([
  readFile(resolve("frontend/public/illustrations/mole-portrait.webp")),
  readFile(resolve("frontend/public/illustrations/ratty-portrait.webp")),
  readFile(resolve("frontend/public/illustrations/riverbank.webp")),
]);

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath });
const observations = {
  phase,
  baseUrl,
  fixture: "deterministic intercepted same-origin /api responses",
  desktopViewport: { width: 1440, height: 1000 },
  mobileViewport: { width: 390, height: 844 },
  consoleErrors: [],
  expectedAuthDiagnostics: [],
  pageErrors: [],
  failedRequests: [],
  expectedNavigationAborts: [],
  externalRequests: [],
  apiRequests: [],
  captures: [],
  assertions: [],
};

function recordAssertion(name, passed, detail = "") {
  observations.assertions.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function createSteps(states = []) {
  const definitions = [
    [1, "style"],
    [2, "characters"],
    [3, "portraits"],
    [4, "chapters"],
    [5, "illustrations"],
  ];
  return definitions.map(([ordinal, key], index) => {
    const visibleState = states[index] ?? "pending";
    return {
      ordinal,
      key,
      status: visibleState === "stuck" ? "running" : visibleState,
      visibleState,
      attemptCount: visibleState === "pending" ? 0 : 1,
      startedAt: visibleState === "pending" ? null : "2026-08-14T01:00:00.000Z",
      completedAt: visibleState === "succeeded" ? "2026-08-14T01:01:00.000Z" : null,
      errorCode: visibleState === "failed" || visibleState === "stuck" ? "PROVIDER_UNAVAILABLE" : null,
      errorMessage: visibleState === "failed" || visibleState === "stuck"
        ? "The illustration press returned an error."
        : null,
    };
  });
}

const style = "Arts & Crafts-era storybook watercolour, with soft ink contours, moss green and weathered ochre, gentle river light, and tactile paper grain.";
const characters = [
  {
    id: "character-mole",
    name: "Mole",
    role: "The curious homebody",
    ageGroup: "adult",
    prompt: "An adult anthropomorphic mole, modest and curious, with velvet-black fur, a cream waistcoat and soil-softened paws; alert dark eyes and a gentle rounded silhouette.",
    portraitState: "succeeded",
    portraitUrl: "/api/projects/riverbank/characters/character-mole/portrait",
  },
  {
    id: "character-ratty",
    name: "Ratty",
    role: "The river guide",
    ageGroup: "adult",
    prompt: "An adult anthropomorphic water vole, assured and warm, wearing a russet tweed jacket and a river-weathered satchel; bright observant eyes and a seasoned boatman's bearing.",
    portraitState: "succeeded",
    portraitUrl: "/api/projects/riverbank/characters/character-ratty/portrait",
  },
];
const chapter = {
  id: "chapter-riverbank",
  name: "The Riverbank",
  prompt: "Mole and Ratty meet beside a luminous spring river. Preserve their established portrait features and compose a single borderless scene with no text.",
  characterNames: ["Mole", "Ratty"],
  illustrationState: "pending",
  illustrationUrl: null,
};
const sampleManuscript = `The Mole had been working very hard all the morning, spring-cleaning his little home. First with brooms, then with dusters; then on ladders and steps and chairs, with a brush and a pail of whitewash; till he had dust in his throat and eyes, and splashes of whitewash all over his black fur, and an aching back and weary arms.

Spring was moving in the air above and in the earth below and around him, penetrating even his dark and lowly little house with its spirit of divine discontent and longing. It was small wonder, then, that he suddenly flung down his brush on the floor, said “Bother!” and “O blow!” and also “Hang spring-cleaning!” and bolted out of the house without even waiting to put on his coat.

Something up above was calling him imperiously, and he made for the steep little tunnel which answered in his case to the gravelled carriage-drive owned by animals whose residences are nearer to the sun and air. So he scraped and scratched and scrabbled and scrooged, and then he scrooged again and scrabbled and scratched and scraped, working busily with his little paws and muttering to himself, “Up we go! Up we go!” till at last, pop! his snout came out into the sunlight, and he found himself rolling in the warm grass of a great meadow.`;
const sampleWordCount = sampleManuscript.trim().split(/\s+/).length;

function project(overrides = {}) {
  return {
    id: "riverbank",
    volumeNumber: 2,
    title: "The Wind in the Willows — Riverbank Edition",
    createdAt: "2026-08-08T09:20:00.000Z",
    updatedAt: "2026-08-14T01:01:00.000Z",
    status: "in_progress",
    sourceWordCount: sampleWordCount,
    completedStepCount: 4,
    totalStepCount: 5,
    source: { mode: "paste", originalName: null, byteCount: new TextEncoder().encode(sampleManuscript).byteLength, wordCount: sampleWordCount },
    style,
    steps: createSteps(["succeeded", "succeeded", "succeeded", "succeeded", "pending"]),
    characters: structuredClone(characters),
    chapters: [structuredClone(chapter)],
    ...overrides,
  };
}

function initialProjects() {
  return [
    project(),
    project({
      id: "frankenstein",
      volumeNumber: 1,
      title: "Frankenstein — The First Awakening",
      createdAt: "2026-08-06T15:40:00.000Z",
      status: "done",
      completedStepCount: 5,
      steps: createSteps(["succeeded", "succeeded", "succeeded", "succeeded", "succeeded"]),
      chapters: [{ ...structuredClone(chapter), illustrationState: "succeeded", illustrationUrl: "/api/projects/frankenstein/chapters/chapter-riverbank/illustration" }],
    }),
    project({
      id: "dorian",
      volumeNumber: 3,
      title: "The Picture of Dorian Gray",
      createdAt: "2026-08-09T11:12:00.000Z",
      status: "draft",
      sourceWordCount: 24,
      completedStepCount: 0,
      style: null,
      steps: createSteps(),
      characters: [],
      chapters: [],
    }),
  ];
}

function summary({ source: _source, style: _style, steps: _steps, characters: _characters, chapters: _chapters, ...value }) {
  return value;
}

function updateProjectStatus(value) {
  value.completedStepCount = value.steps.filter((step) => step.visibleState === "succeeded").length;
  value.status = value.completedStepCount === 0
    ? "draft"
    : value.completedStepCount === 5 ? "done" : "in_progress";
  value.updatedAt = "2026-08-14T02:00:00.000Z";
}

function apiFixture() {
  const state = {
    session: null,
    projects: initialProjects(),
    manuscripts: new Map([
      ["riverbank", sampleManuscript],
      ["frankenstein", "It was on a dreary night of November that I beheld the accomplishment of my toils."],
      ["dorian", "The studio was filled with the rich odour of roses."],
    ]),
  };

  const envelope = (code, message, fieldErrors) => ({
    error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) },
  });
  const json = (route, value, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });

  async function handler(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    observations.apiRequests.push({ method, path });

    if (path.includes("/portrait") && method === "GET") {
      const body = path.includes("ratty") ? rattyPortrait : molePortrait;
      return route.fulfill({ status: 200, contentType: "image/webp", body });
    }
    if (path.includes("/illustration") && method === "GET") {
      return route.fulfill({ status: 200, contentType: "image/webp", body: riverbankPlate });
    }
    if (path === "/api/session" && method === "GET") {
      return state.session
        ? json(route, state.session)
        : json(route, envelope("UNAUTHENTICATED", "A valid session is required."), 401);
    }
    if (path === "/api/session" && method === "POST") {
      const input = request.postDataJSON();
      state.session = {
        user: { id: "fixture-user", name: input.name, email: input.email.toLowerCase() },
        expiresAt: "2026-08-15T00:00:00.000Z",
      };
      return json(route, state.session);
    }
    if (path === "/api/session" && method === "DELETE") {
      state.session = null;
      return json(route, { signedOut: true });
    }
    if (!state.session) {
      return json(route, envelope("UNAUTHENTICATED", "A valid session is required."), 401);
    }
    if (path === "/api/projects" && method === "GET") {
      return json(route, { projects: state.projects.map(summary) });
    }
    if (path === "/api/projects" && method === "POST") {
      const input = request.postDataJSON();
      const text = input.text;
      const created = project({
        id: "baseline-pipeline",
        volumeNumber: 4,
        title: input.title,
        createdAt: "2026-08-14T02:00:00.000Z",
        status: "draft",
        sourceWordCount: text.trim().split(/\s+/).length,
        completedStepCount: 0,
        source: { mode: "paste", originalName: null, byteCount: new TextEncoder().encode(text).byteLength, wordCount: text.trim().split(/\s+/).length },
        style: null,
        steps: createSteps(),
        characters: [],
        chapters: [],
      });
      state.projects.unshift(created);
      state.manuscripts.set(created.id, text);
      return json(route, created, 201);
    }

    const manuscriptMatch = path.match(/^\/api\/projects\/([^/]+)\/manuscript$/);
    if (manuscriptMatch && method === "GET") {
      return json(route, { text: state.manuscripts.get(manuscriptMatch[1]) ?? "" });
    }
    const recoverMatch = path.match(/^\/api\/projects\/([^/]+)\/steps\/(\d)\/recover$/);
    if (recoverMatch && method === "POST") {
      const value = state.projects.find(({ id }) => id === recoverMatch[1]);
      const step = value.steps[Number(recoverMatch[2]) - 1];
      step.status = "failed";
      step.visibleState = "failed";
      step.errorCode = "PROCESS_INTERRUPTED";
      step.errorMessage = "The interrupted attempt was recovered and is ready for an explicit retry.";
      updateProjectStatus(value);
      return json(route, { disposition: "recovered", project: value });
    }
    const runMatch = path.match(/^\/api\/projects\/([^/]+)\/steps\/(\d)\/run$/);
    if (runMatch && method === "POST") {
      const value = state.projects.find(({ id }) => id === runMatch[1]);
      const ordinal = Number(runMatch[2]);
      const step = value.steps[ordinal - 1];
      step.status = "running";
      step.visibleState = "running";
      step.startedAt = "2026-08-14T02:00:00.000Z";
      step.errorCode = null;
      step.errorMessage = null;
      updateProjectStatus(value);

      await new Promise((resolveDelay) => setTimeout(resolveDelay, ordinal === 3 ? 620 : 420));
      if (ordinal === 1) value.style = request.postDataJSON().artDirection || style;
      if (ordinal === 2) {
        value.characters = structuredClone(characters).map((character) => ({
          ...character,
          portraitState: "pending",
          portraitUrl: null,
        }));
      }
      if (ordinal === 3) {
        value.characters[0].portraitState = "succeeded";
        value.characters[0].portraitUrl = "/api/projects/baseline-pipeline/characters/character-mole/portrait";
        value.characters[1].portraitState = "succeeded";
        value.characters[1].portraitUrl = "/api/projects/baseline-pipeline/characters/character-ratty/portrait";
      }
      if (ordinal === 4) value.chapters = [structuredClone(chapter)];
      if (ordinal === 5) {
        value.chapters[0].illustrationState = "succeeded";
        value.chapters[0].illustrationUrl = `/api/projects/${value.id}/chapters/chapter-riverbank/illustration`;
      }
      step.status = "succeeded";
      step.visibleState = "succeeded";
      step.completedAt = "2026-08-14T02:01:00.000Z";
      updateProjectStatus(value);
      return json(route, { disposition: "succeeded", project: value });
    }
    const detailMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (detailMatch && method === "GET") {
      const value = state.projects.find(({ id }) => id === detailMatch[1]);
      return value
        ? json(route, value)
        : json(route, envelope("NOT_FOUND", "Project not found."), 404);
    }
    return json(route, envelope("NOT_FOUND", "Resource not found."), 404);
  }

  return { state, handler };
}

function observePage(page, label) {
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== new URL(baseUrl).origin) {
      observations.externalRequests.push({ page: label, method: request.method(), url: request.url() });
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const entry = { page: label, text: message.text() };
    if (message.text().includes("status of 401")) observations.expectedAuthDiagnostics.push(entry);
    else observations.consoleErrors.push(entry);
  });
  page.on("pageerror", (error) => observations.pageErrors.push({ page: label, text: error.message }));
  page.on("requestfailed", (request) => {
    const entry = {
      page: label,
      url: request.url(),
      error: request.failure()?.errorText ?? "unknown",
    };
    if (entry.error === "net::ERR_ABORTED") observations.expectedNavigationAborts.push(entry);
    else observations.failedRequests.push(entry);
  });
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolveImage) => {
          image.addEventListener("load", resolveImage, { once: true });
          image.addEventListener("error", resolveImage, { once: true });
        })));
  });
  await page.waitForTimeout(180);
}

async function screenshot(page, name) {
  await settle(page);
  observations.captures.push({ name, scrollY: await page.evaluate(() => window.scrollY) });
  await page.screenshot({ path: resolve(outputDirectory, name) });
}

async function expectVisible(locator, name) {
  await locator.waitFor({ state: "visible" });
  recordAssertion(name, await locator.isVisible());
}

async function assertNoOverflow(page, name) {
  recordAssertion(name, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}

async function installFixture(context) {
  const fixture = apiFixture();
  await context.route(`${baseUrl}/api/**`, fixture.handler);
  return fixture;
}

const desktopContext = await browser.newContext({ viewport: observations.desktopViewport });
const desktopFixture = await installFixture(desktopContext);
const desktop = await desktopContext.newPage();
observePage(desktop, "desktop");

await desktop.goto(baseUrl, { waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: /Return to\s+the folio/ }), "unauthenticated root redirects to Login");
recordAssertion("Login uses its direct route", new URL(desktop.url()).pathname === "/login", desktop.url());
recordAssertion("no authoritative localStorage snapshot", await desktop.evaluate(() => localStorage.length === 0));
await screenshot(desktop, "login-desktop-1440x1000.png");

await desktop.getByLabel("Studio identity").getByRole("button", { name: /Enter/ }).click();
await expectVisible(desktop.getByText("Enter your full name to continue."), "name validation renders");
await desktop.getByLabel("Full name").fill("Xuan Sang");
await desktop.getByLabel("Email").fill("invalid-email");
await desktop.getByLabel("Studio identity").getByRole("button", { name: /Enter/ }).click();
await expectVisible(desktop.getByText("Enter a valid email address to continue."), "email validation renders");
await desktop.getByLabel("Email").fill("reader@example.com");
await desktop.getByLabel("Studio identity").getByRole("button", { name: /Enter/ }).click();
await expectVisible(desktop.getByRole("heading", { name: /Your volumes/ }), "session login opens Library");
recordAssertion("Library uses its direct route", new URL(desktop.url()).pathname === "/library", desktop.url());
await screenshot(desktop, "library-desktop-1440x1000.png");
await assertNoOverflow(desktop, "desktop Library has no document overflow");

await desktop.reload({ waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: /Your volumes/ }), "cookie session restores Library on reload");
await desktop.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: /Your volumes/ }), "active session redirects away from Login");

await desktop.getByRole("button", { name: "New volume", exact: true }).click();
await expectVisible(desktop.getByRole("heading", { name: /Begin a new volume/ }), "New Volume opens");
await screenshot(desktop, "new-volume-desktop-1440x1000.png");
await desktop.getByRole("button", { name: "Upload manuscript" }).click();
await expectVisible(desktop.getByRole("dialog", { name: "Bring in the manuscript." }), "upload dialog opens");
await screenshot(desktop, "upload-dialog-desktop-1440x1000.png");
await desktop.keyboard.press("Escape");
await desktop.waitForTimeout(50);
recordAssertion("Escape closes source dialog and restores focus", await desktop.getByRole("button", { name: "Upload manuscript" }).evaluate((element) => document.activeElement === element));

await desktop.getByRole("button", { name: "Paste text instead" }).click();
await desktop.getByLabel("Paste the complete manuscript").fill("The first page opened beneath a copper lamp. Every line waited for its plate.");
await screenshot(desktop, "paste-dialog-desktop-1440x1000.png");
await desktop.getByRole("button", { name: /Use pasted text/ }).click();
await desktop.getByLabel("Volume title").fill("Baseline Pipeline Volume");
await desktop.getByRole("button", { name: /Create this volume/ }).click();
await expectVisible(desktop.getByRole("heading", { name: "Establish the visual grammar." }), "created project enters persisted Studio");
await desktop.locator(".action-panel").evaluate((element) => {
  const box = element.getBoundingClientRect();
  window.scrollTo(0, window.scrollY + box.bottom - 219);
});
await screenshot(desktop, "studio-pending-desktop-1440x1000.png");

const generatedLabels = ["Style", "Characters", "Portraits", "Chapter", "Illustration"];
const stageExecutionTraceStart = observations.apiRequests.length;
for (const [index, label] of generatedLabels.entries()) {
  await desktop.getByRole("button", { name: new RegExp(`Generate ${label}`, "i") }).click();
  if (index === 0) {
    await expectVisible(desktop.getByText(/Gemini request in flight/), "pending run maps to named running state");
    await desktop.locator(".action-panel").evaluate((element) => {
      const box = element.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + box.bottom - 219);
    });
    await screenshot(desktop, "studio-running-desktop-1440x1000.png");
  }
  if (index < generatedLabels.length - 1) {
    await desktop.getByRole("button", { name: new RegExp(`Generate ${generatedLabels[index + 1]}`, "i") }).waitFor({ state: "visible", timeout: 6_000 });
  } else {
    await desktop.getByRole("heading", { name: "The final plate is in the folio." }).waitFor({ state: "visible", timeout: 6_000 });
  }
}
const stageExecutionApiTrace = observations.apiRequests.slice(stageExecutionTraceStart);
observations.stageExecutionApiTrace = stageExecutionApiTrace;
recordAssertion(
  "stage execution does not refetch manuscript",
  stageExecutionApiTrace.filter(({ method, path }) => (
    method === "GET" && path === "/api/projects/baseline-pipeline/manuscript"
  )).length === 0,
  JSON.stringify(stageExecutionApiTrace),
);
recordAssertion(
  "successful stage execution does not duplicate detail reconciliation",
  stageExecutionApiTrace.filter(({ method, path }) => (
    method === "GET" && path === "/api/projects/baseline-pipeline"
  )).length === 0,
  JSON.stringify(stageExecutionApiTrace),
);
await desktop.evaluate(() => window.scrollTo(0, 0));
await screenshot(desktop, "studio-completed-desktop-1440x1000.png");
recordAssertion("generated illustration uses authenticated API URL", await desktop.locator(".chapter-image").getAttribute("src") === "/api/projects/baseline-pipeline/chapters/chapter-riverbank/illustration");

await desktop.getByRole("button", { name: "Library", exact: true }).click();
await desktop.getByRole("button", { name: /The Wind in the Willows/ }).click();
await expectVisible(desktop.getByRole("heading", { name: "Generate illustration." }), "persisted Stage V Studio opens");
await screenshot(desktop, "studio-desktop-1440x1000.png");
await desktop.getByRole("button", { name: /Read the complete text/ }).click();
await expectVisible(desktop.getByRole("dialog", { name: /Wind in the Willows/ }), "manuscript dialog opens from API text");
await screenshot(desktop, "manuscript-dialog-desktop-1440x1000.png");
await desktop.keyboard.press("Escape");
await desktop.waitForTimeout(50);
recordAssertion("Escape closes manuscript and restores focus", await desktop.getByRole("button", { name: /Read the complete text/ }).evaluate((element) => document.activeElement === element));

await desktop.goto(`${baseUrl}/library`, { waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: /Your volumes/ }), "direct Library route renders");
await desktop.goto(`${baseUrl}/volumes/new`, { waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: /Begin a new volume/ }), "direct New Volume route renders");
await desktop.goto(`${baseUrl}/volumes/riverbank`, { waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: "Generate illustration." }), "direct Studio route renders");

const riverbank = desktopFixture.state.projects.find(({ id }) => id === "riverbank");
riverbank.steps[4] = { ...riverbank.steps[4], status: "failed", visibleState: "failed", errorCode: "PROVIDER_UNAVAILABLE", errorMessage: "The illustration press returned an error." };
updateProjectStatus(riverbank);
await desktop.reload({ waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: "Illustration could not be completed." }), "failed state maps to Retry");
await screenshot(desktop, "studio-failed-desktop-1440x1000.png");

riverbank.steps[4] = { ...riverbank.steps[4], status: "running", visibleState: "stuck", errorCode: "PROCESS_INTERRUPTED", errorMessage: "The illustration request exceeded its lease." };
updateProjectStatus(riverbank);
await desktop.reload({ waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: "This stage has stopped responding." }), "stuck state maps to Recover");
await screenshot(desktop, "studio-stuck-desktop-1440x1000.png");
const recoveryTraceStart = observations.apiRequests.length;
await desktop.getByRole("button", { name: /Recover this stage/ }).click();
await expectVisible(desktop.getByRole("button", { name: /Retry Illustration/ }), "Recover stops at failed retryable state");
const recoveryApiTrace = observations.apiRequests.slice(recoveryTraceStart);
observations.recoveryApiTrace = recoveryApiTrace;
recordAssertion(
  "Recover does not refetch manuscript",
  recoveryApiTrace.filter(({ method, path }) => (
    method === "GET" && path === "/api/projects/riverbank/manuscript"
  )).length === 0,
  JSON.stringify(recoveryApiTrace),
);
recordAssertion(
  "successful Recover does not duplicate detail reconciliation",
  recoveryApiTrace.filter(({ method, path }) => (
    method === "GET" && path === "/api/projects/riverbank"
  )).length === 0,
  JSON.stringify(recoveryApiTrace),
);

await desktop.getByRole("button", { name: "Sign out" }).click();
await expectVisible(desktop.getByRole("heading", { name: /Return to\s+the folio/ }), "sign out returns to Login");
recordAssertion("sign out clears intercepted session", desktopFixture.state.session === null);

const mobileContext = await browser.newContext({ viewport: observations.mobileViewport });
await installFixture(mobileContext);
const mobile = await mobileContext.newPage();
observePage(mobile, "mobile");
await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
await expectVisible(mobile.getByRole("heading", { name: /Return to\s+the folio/ }), "mobile Login renders");
await screenshot(mobile, "login-mobile-390x844.png");
await assertNoOverflow(mobile, "mobile Login has no document overflow");
await mobile.getByLabel("Full name").fill("Xuan Sang");
await mobile.getByLabel("Email").fill("mobile@example.com");
await mobile.getByRole("button", { name: /Enter/ }).click();
await expectVisible(mobile.getByRole("heading", { name: /Your volumes/ }), "mobile Library opens through session API");
await screenshot(mobile, "library-mobile-390x844.png");
await assertNoOverflow(mobile, "mobile Library has no document overflow");
await mobile.getByRole("button", { name: /The Wind in the Willows/ }).click();
await expectVisible(mobile.getByRole("heading", { name: "Generate illustration." }), "mobile Studio opens");
await settle(mobile);
await mobile.locator(".chapter-art").evaluate((element) => {
  window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 72);
});
await screenshot(mobile, "studio-mobile-390x844.png");
await assertNoOverflow(mobile, "mobile Studio has no document overflow");

recordAssertion("no page errors", observations.pageErrors.length === 0, JSON.stringify(observations.pageErrors));
recordAssertion("no console errors", observations.consoleErrors.length === 0, JSON.stringify(observations.consoleErrors));
recordAssertion("no failed requests", observations.failedRequests.length === 0, JSON.stringify(observations.failedRequests));
recordAssertion("no external provider requests", observations.externalRequests.length === 0, JSON.stringify(observations.externalRequests));

await writeFile(resolve(outputDirectory, "observations.json"), `${JSON.stringify(observations, null, 2)}\n`, "utf8");
await desktopContext.close();
await mobileContext.close();
await browser.close();

console.log(`Captured ${phase} API-backed visual baseline in ${outputDirectory}`);
