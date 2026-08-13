import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? "playwright";
const { chromium } = await import(playwrightModule);

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const phase = process.argv[2] ?? "before";
const outputDirectory = resolve(`docs/baseline/${phase}`);
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
const storageKey = "gradion-folio-prototype-v2";

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath });
const observations = {
  phase,
  baseUrl,
  desktopViewport: { width: 1440, height: 1000 },
  mobileViewport: { width: 390, height: 844 },
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  assertions: [],
};

function recordAssertion(name, passed, detail = "") {
  observations.assertions.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function observePage(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      observations.consoleErrors.push({ page: label, text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    observations.pageErrors.push({ page: label, text: error.message });
  });
  page.on("requestfailed", (request) => {
    observations.failedRequests.push({
      page: label,
      url: request.url(),
      error: request.failure()?.errorText ?? "unknown",
    });
  });
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((image) => image.getBoundingClientRect().top < window.innerHeight * 1.5)
        .map((image) => image.complete
          ? Promise.resolve()
          : new Promise((resolveImage) => {
              image.addEventListener("load", resolveImage, { once: true });
              image.addEventListener("error", resolveImage, { once: true });
            })),
    );
  });
  await page.waitForTimeout(180);
}

async function screenshot(page, name) {
  await settle(page);
  await page.screenshot({ path: resolve(outputDirectory, name) });
}

async function expectVisible(locator, name) {
  await locator.waitFor({ state: "visible" });
  recordAssertion(name, await locator.isVisible());
}

async function setProjectState(page, projectId, stepState, error) {
  await page.evaluate(({ key, id, state, message }) => {
    const snapshot = JSON.parse(localStorage.getItem(key));
    snapshot.view = "studio";
    snapshot.activeProjectId = id;
    snapshot.projects = snapshot.projects.map((project) =>
      project.id === id ? { ...project, stepState: state, error: message } : project,
    );
    localStorage.setItem(key, JSON.stringify(snapshot));
  }, { key: storageKey, id: projectId, state: stepState, message: error });
  await page.reload({ waitUntil: "domcontentloaded" });
}

const desktopContext = await browser.newContext({ viewport: observations.desktopViewport });
const desktop = await desktopContext.newPage();
observePage(desktop, "desktop");

await desktop.goto(baseUrl, { waitUntil: "domcontentloaded" });
await desktop.evaluate((key) => localStorage.removeItem(key), storageKey);
await desktop.reload({ waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: /Return to\s+the folio/ }), "login renders");
await screenshot(desktop, "login-desktop-1440x1000.png");

await desktop.getByLabel("Studio identity").getByRole("button", { name: /Enter/ }).click();
await expectVisible(desktop.getByText("Enter your full name to continue."), "name validation renders");
await desktop.getByLabel("Full name").fill("Baseline Reader");
await desktop.getByLabel("Email").fill("invalid-email");
await desktop.getByLabel("Studio identity").getByRole("button", { name: /Enter/ }).click();
await expectVisible(desktop.getByText("Enter a valid email address to continue."), "email validation renders");

await desktop.getByRole("button", { name: /Use the sample library/ }).click();
await expectVisible(desktop.getByRole("heading", { name: /Your volumes/ }), "sample library opens");
await desktop.waitForFunction((key) => Boolean(localStorage.getItem(key)), storageKey);
const libraryUrl = desktop.url();
const libraryHistoryLength = await desktop.evaluate(() => history.length);
const storedLibrary = await desktop.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
recordAssertion("sample identity stored", storedLibrary.userEmail === "sang@example.com");
recordAssertion("sample projects stored", storedLibrary.projects.length === 3);
recordAssertion("library view stored", storedLibrary.view === "library");
await screenshot(desktop, "library-desktop-1440x1000.png");

await desktop.reload({ waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: /Your volumes/ }), "library survives reload");
recordAssertion("baseline navigation remains on one URL", desktop.url() === libraryUrl, desktop.url());

await desktop.getByRole("button", { name: "New volume", exact: true }).click();
await expectVisible(desktop.getByRole("heading", { name: /Begin a new volume/ }), "new volume opens");
recordAssertion(
  "baseline state navigation does not push history",
  (await desktop.evaluate(() => history.length)) === libraryHistoryLength,
);
await screenshot(desktop, "new-volume-desktop-1440x1000.png");

await desktop.getByRole("button", { name: "Upload manuscript" }).click();
await expectVisible(desktop.getByRole("dialog", { name: "Bring in the manuscript." }), "upload dialog opens");
await screenshot(desktop, "upload-dialog-desktop-1440x1000.png");
const fileInput = desktop.locator('input[type="file"]');
await fileInput.setInputFiles({ name: "invalid.md", mimeType: "text/markdown", buffer: Buffer.from("invalid") });
await expectVisible(desktop.getByText("Please choose a plain .txt manuscript."), "invalid upload is rejected");
await fileInput.setInputFiles({
  name: "baseline.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("A small manuscript used to verify the upload receipt and replacement flow."),
});
await expectVisible(desktop.getByText("baseline.txt", { exact: true }), "valid upload creates receipt");
await desktop.getByRole("button", { name: "Remove" }).click();
await desktop.getByRole("button", { name: "Paste text instead" }).click();
await desktop.getByLabel("Paste the complete manuscript").fill(
  "The first page opened beneath a copper lamp. Every line waited for its plate.",
);
await screenshot(desktop, "paste-dialog-desktop-1440x1000.png");
await desktop.getByRole("button", { name: /Use pasted text/ }).click();
await desktop.getByLabel("Volume title").fill("Baseline Pipeline Volume");
await desktop.getByRole("button", { name: /Create this volume/ }).click();
await expectVisible(desktop.getByRole("heading", { name: "Establish the visual grammar." }), "new project enters studio");
await screenshot(desktop, "studio-pending-desktop-1440x1000.png");

const generatedLabels = ["Style", "Characters", "Portraits", "Chapter", "Illustration"];
for (const [index, label] of generatedLabels.entries()) {
  const generateButton = desktop.getByRole("button", { name: new RegExp(`Generate ${label}`, "i") });
  await generateButton.click();
  if (index === 0) {
    await expectVisible(desktop.getByText(/Gemini request in flight/), "running state renders");
    await screenshot(desktop, "studio-running-desktop-1440x1000.png");
  }
  if (index < generatedLabels.length - 1) {
    await desktop.getByRole("button", {
      name: new RegExp(`Generate ${generatedLabels[index + 1]}`, "i"),
    }).waitFor({ state: "visible", timeout: 6000 });
  } else {
    await desktop.getByRole("heading", { name: "The final plate is in the folio." }).waitFor({
      state: "visible",
      timeout: 6000,
    });
  }
}
await screenshot(desktop, "studio-completed-desktop-1440x1000.png");
await desktop.reload({ waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: "The final plate is in the folio." }), "completed pipeline survives reload");

await desktop.getByRole("button", { name: "Library", exact: true }).click();
await desktop.getByRole("button", { name: /The Wind in the Willows/ }).click();
await expectVisible(desktop.getByRole("heading", { name: "Generate illustration." }), "seed studio opens");
await screenshot(desktop, "studio-desktop-1440x1000.png");
await desktop.getByRole("button", { name: /Read the complete text/ }).click();
await expectVisible(desktop.getByRole("dialog", { name: /Wind in the Willows/ }), "manuscript dialog opens");
await screenshot(desktop, "manuscript-dialog-desktop-1440x1000.png");
await desktop.getByRole("button", { name: "Close manuscript" }).click();

await setProjectState(desktop, "riverbank", "failed", "The illustration press returned an error.");
await expectVisible(desktop.getByRole("heading", { name: "Illustration could not be completed." }), "failed state renders");
await screenshot(desktop, "studio-failed-desktop-1440x1000.png");
await desktop.getByRole("button", { name: /Retry Illustration/ }).click();
await expectVisible(desktop.getByText(/Gemini request in flight/), "failed stage retries");

await setProjectState(desktop, "riverbank", "stuck", "The illustration request exceeded its lease.");
await expectVisible(desktop.getByRole("heading", { name: "This stage has stopped responding." }), "stuck state renders");
await screenshot(desktop, "studio-stuck-desktop-1440x1000.png");
await desktop.getByRole("button", { name: /Recover this stage/ }).click();
await expectVisible(desktop.getByRole("button", { name: /Generate Illustration/ }), "stuck stage recovers");

await desktop.getByRole("button", { name: "Sign out" }).click();
await expectVisible(desktop.getByRole("heading", { name: /Return to\s+the folio/ }), "sign out returns to login");
await desktop.reload({ waitUntil: "domcontentloaded" });
await expectVisible(desktop.getByRole("heading", { name: /Return to\s+the folio/ }), "signed-out view survives reload");

const mobileContext = await browser.newContext({ viewport: observations.mobileViewport });
const mobile = await mobileContext.newPage();
observePage(mobile, "mobile");
await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
await expectVisible(mobile.getByRole("heading", { name: /Return to\s+the folio/ }), "mobile login renders");
await screenshot(mobile, "login-mobile-390x844.png");
recordAssertion(
  "mobile login has no document overflow",
  await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
);
await mobile.getByRole("button", { name: /Use the sample library/ }).click();
await expectVisible(mobile.getByRole("heading", { name: /Your volumes/ }), "mobile library opens");
await screenshot(mobile, "library-mobile-390x844.png");
recordAssertion(
  "mobile library has no document overflow",
  await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
);
await mobile.getByRole("button", { name: /The Wind in the Willows/ }).click();
await expectVisible(mobile.getByRole("heading", { name: "Generate illustration." }), "mobile studio opens");
await screenshot(mobile, "studio-mobile-390x844.png");
recordAssertion(
  "mobile studio has no document overflow",
  await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
);

recordAssertion("no page errors", observations.pageErrors.length === 0, JSON.stringify(observations.pageErrors));
recordAssertion("no console errors", observations.consoleErrors.length === 0, JSON.stringify(observations.consoleErrors));
recordAssertion("no failed requests", observations.failedRequests.length === 0, JSON.stringify(observations.failedRequests));

await writeFile(
  resolve(outputDirectory, "observations.json"),
  `${JSON.stringify(observations, null, 2)}\n`,
  "utf8",
);

await desktopContext.close();
await mobileContext.close();
await browser.close();

console.log(`Captured ${phase} visual baseline in ${outputDirectory}`);
