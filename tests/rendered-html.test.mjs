import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Folio studio entry experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Gradion \/ Folio — Book Illustration Studio<\/title>/i);
  assert.match(html, /Return to/);
  assert.match(html, /the folio/);
  assert.match(html, /Enter the studio/);
  assert.match(html, /Use the sample library/);
  assert.match(html, /PROTOTYPE IDENTITY/);
  assert.match(html, /FULL NAME/i);
  assert.match(html, /EMAIL/i);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /login-plate-gallery/i);
  assert.doesNotMatch(html, /type="password"/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("prototype source covers the required product states", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  for (const requirement of [
    "Art direction",
    "Characters",
    "Portraits",
    "Chapter",
    "Illustration",
    "Read the complete text",
    "Recover this stage",
    "duplicate execution locked",
    "2 OF 2 SLOTS USED",
    "1 OF 1 SLOT USED",
    "Upload",
    "Sign out",
    "aria-invalid",
    "nameInputRef",
    "emailInputRef",
    "projectPlateSrc",
    "folio-triptych.webp",
    "library-intro-action",
    "PLATE I · THE RIVERBANK",
    "NEW VOLUME · SOURCE TEXT",
    "new-project-proof",
    "proof-card-two",
    "proof-card-four",
    "proof-card-five",
    "PLATES I–V",
    "commission-actions",
    "commission-desk",
    "pipeline-ledger",
    "studio-closing-folio",
    "studio-new-triptych.webp",
    "studio-progress",
    "title-input-row",
    "folio-mascot.png",
    "folio-mascot-loop.webp",
    "prefers-reduced-motion: no-preference",
    "Upload manuscript",
    "source-dialog",
    "aria-haspopup=\"dialog\"",
    "sourceModalOpen",
    "source-drop-zone",
    "accept=\".txt,text/plain\"",
    "Text input",
    "aria-live=\"polite\"",
    "newTitleInputRef",
    "newTextInputRef",
    "newFileInputRef",
    "new-title-error",
    "new-file-error",
    "new-manuscript-error",
  ]) {
    assert.match(page, new RegExp(requirement, "i"));
  }

  assert.doesNotMatch(page, /edition-strip|INTERACTIVE PROTOTYPE|EDITION № 01/);
  assert.doesNotMatch(page, /Return to the library/i);
  assert.doesNotMatch(page, /account-seal/);
  assert.doesNotMatch(page, /Google Drive|Slack/);
  assert.doesNotMatch(page, /Prototype controls|TEST PRESS|RESET PIPELINE/i);
  assert.doesNotMatch(page, /project-cover|project-docket|project-heading/i);
  assert.match(styles, /folio-diptych-v1\.jpg/i);
  assert.match(styles, /\.commission-input-grid\s*\{[^}]*align-items:\s*stretch;[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(styles, /\.pipeline-ledger\s*>\s*header\s*\{[^}]*border-bottom:\s*0;/s);
});
