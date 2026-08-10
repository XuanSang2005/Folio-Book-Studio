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

test("server-renders the Folio identity experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Gradion \/ Folio — Book Illustration Studio<\/title>/i);
  assert.match(html, /Turn prose/);
  assert.match(html, /into plates/);
  assert.match(html, /Use sample identity/);
  assert.match(html, /five-stage studio/i);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("prototype source covers the required product states", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  for (const requirement of [
    "Art direction",
    "Characters",
    "Portraits",
    "Chapter",
    "Illustration",
    "Read full manuscript",
    "Fail next",
    "Interrupt next",
    "Recover this stage",
    "duplicate execution locked",
    "2 OF 2 SLOTS USED",
    "1 OF 1 SLOT USED",
    "Upload",
    "Sign out",
  ]) {
    assert.match(page, new RegExp(requirement, "i"));
  }
});
