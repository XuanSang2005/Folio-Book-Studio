import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectDetailDtoSchema } from "@gradion-folio/contracts";
import {
  createUploadProject,
  signIn,
} from "./helpers/api.js";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

async function createPasteProject(
  harness: TestHarness,
  cookie: string,
  input: Record<string, unknown> = {},
) {
  return harness.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie },
    payload: {
      title: "Pasted volume",
      sourceMode: "paste",
      text: "Canonical manuscript text.",
      ...input,
    },
  });
}

describe("owner-scoped projects and private manuscripts", () => {
  it("creates a pasted source atomically with canonical metadata and five pending steps", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);
    const canonicalText = "First line\nSecond line\n";
    const response = await createPasteProject(harness, cookie, {
      text: `\uFEFFFirst line\r\nSecond line\r`,
    });

    expect(response.statusCode).toBe(201);
    const project = ProjectDetailDtoSchema.parse(response.json());
    expect(project).toMatchObject({
      volumeNumber: 1,
      status: "draft",
      completedStepCount: 0,
      source: {
        mode: "paste",
        originalName: null,
        byteCount: new TextEncoder().encode(canonicalText).byteLength,
        wordCount: 4,
      },
      style: null,
      characters: [],
      chapters: [],
    });
    expect(project.steps.map(({ ordinal, key, status, attemptCount }) => ({
      ordinal,
      key,
      status,
      attemptCount,
    }))).toEqual([
      { ordinal: 1, key: "style", status: "pending", attemptCount: 0 },
      { ordinal: 2, key: "characters", status: "pending", attemptCount: 0 },
      { ordinal: 3, key: "portraits", status: "pending", attemptCount: 0 },
      { ordinal: 4, key: "chapters", status: "pending", attemptCount: 0 },
      { ordinal: 5, key: "illustrations", status: "pending", attemptCount: 0 },
    ]);

    const databaseProject = harness.database.prepare(`
      SELECT source_path, source_sha256, source_bytes, source_words FROM projects WHERE id = ?
    `).get(project.id) as {
      source_path: string;
      source_sha256: string;
      source_bytes: number;
      source_words: number;
    };
    expect(databaseProject.source_path).toBe(
      `users/${project.id.replace(/2$/, "1")}/projects/${project.id}/source/book.txt`,
    );
    expect(databaseProject.source_path).not.toContain("Pasted volume");
    expect(databaseProject.source_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(databaseProject.source_bytes).toBe(project.source.byteCount);
    expect(databaseProject.source_words).toBe(4);
    expect(await readFile(join(harness.config.DATA_DIR, databaseProject.source_path), "utf8"))
      .toBe(canonicalText);
    expect(harness.database.prepare(`
      SELECT ordinal, key, status, attempt_count FROM pipeline_steps
      WHERE project_id = ? ORDER BY ordinal
    `).all(project.id)).toHaveLength(5);

    const manuscript = await harness.app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/manuscript`,
      headers: { cookie },
    });
    expect(manuscript.statusCode).toBe(200);
    expect(manuscript.json()).toEqual({ text: canonicalText });
    expect(manuscript.headers["cache-control"]).toBe("private, no-store");
    expect(manuscript.headers["x-content-type-options"]).toBe("nosniff");
    expect(harness.gemini.operations).toEqual([]);
  });

  it("accepts one .txt upload with text/plain or an omitted browser MIME", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);

    const plain = await createUploadProject(harness, cookie, {
      title: "Plain MIME",
      filename: "BOOK.TXT",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("Plain upload."),
    });
    const emptyMime = await createUploadProject(harness, cookie, {
      title: "Empty MIME",
      filename: "empty.txt",
      bytes: new TextEncoder().encode("Browser omitted its MIME."),
    });

    expect([plain.statusCode, emptyMime.statusCode]).toEqual([201, 201]);
    expect(plain.json()).toMatchObject({
      volumeNumber: 1,
      source: { mode: "upload", originalName: "BOOK.TXT" },
    });
    expect(emptyMime.json()).toMatchObject({
      volumeNumber: 2,
      source: { mode: "upload", originalName: "empty.txt" },
    });
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM projects").get())
      .toEqual({ count: 2 });
  });

  it.each([
    ["wrong extension", { filename: "book.md", bytes: new TextEncoder().encode("Text") }],
    ["wrong MIME", { filename: "book.txt", mimeType: "image/png", bytes: new TextEncoder().encode("Text") }],
    ["invalid UTF-8", { filename: "book.txt", bytes: new Uint8Array([0xc3, 0x28]) }],
    ["NUL", { filename: "book.txt", bytes: new Uint8Array([0x41, 0, 0x42]) }],
    ["blank", { filename: "book.txt", bytes: new TextEncoder().encode(" \n\t ") }],
  ])("rejects %s upload content without creating a project", async (_name, upload) => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);
    const response = await createUploadProject(harness, cookie, upload);

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM projects").get())
      .toEqual({ count: 0 });
  });

  it("rejects oversized sources before making a project visible", async () => {
    const harness = await createTestHarness({ environment: { MAX_SOURCE_BYTES: "16" } });
    harnesses.push(harness);
    const { cookie } = await signIn(harness);
    const response = await createUploadProject(harness, cookie, {
      bytes: new TextEncoder().encode("This source is more than sixteen bytes."),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM projects").get())
      .toEqual({ count: 0 });
  });

  it("rejects mixed, missing, and extra multipart source modes", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);

    const bothJson = await createPasteProject(harness, cookie, { file: "also-uploaded" });
    const neitherJson = await harness.app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie },
      payload: { title: "No source", sourceMode: "paste" },
    });
    const mixedMultipart = await createUploadProject(harness, cookie, {
      fields: { title: "Mixed", sourceMode: "upload", text: "also pasted" },
    });
    const extraFile = await createUploadProject(harness, cookie, {
      files: [
        { filename: "one.txt", bytes: new TextEncoder().encode("One") },
        { filename: "two.txt", bytes: new TextEncoder().encode("Two") },
      ],
    });

    expect([bothJson, neitherJson, mixedMultipart, extraFile].map(({ statusCode }) => statusCode))
      .toEqual([400, 400, 400, 400]);
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM projects").get())
      .toEqual({ count: 0 });
  });

  it("scopes list, detail, and manuscript access to the session owner", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const userA = await signIn(harness, { name: "User A", email: "a@example.com" });
    const created = await createPasteProject(harness, userA.cookie);
    const projectId = created.json().id as string;
    const userB = await signIn(harness, { name: "User B", email: "b@example.com" });

    const ownList = await harness.app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { cookie: userA.cookie },
    });
    const foreignList = await harness.app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { cookie: userB.cookie },
    });
    expect(ownList.json().projects.map(({ id }: { id: string }) => id)).toEqual([projectId]);
    expect(ownList.json().projects[0].sourceWordCount).toBe(3);
    expect(foreignList.json()).toEqual({ projects: [] });

    const foreignDetail = await harness.app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
      headers: { cookie: userB.cookie },
    });
    const foreignManuscript = await harness.app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/manuscript`,
      headers: { cookie: userB.cookie },
    });
    const missingDetail = await harness.app.inject({
      method: "GET",
      url: "/api/projects/00000000-0000-4000-8000-999999999999",
      headers: { cookie: userB.cookie },
    });
    expect(foreignDetail.statusCode).toBe(404);
    expect(foreignManuscript.statusCode).toBe(404);
    expect(foreignDetail.json()).toEqual(missingDetail.json());
    expect(foreignManuscript.json()).toEqual(missingDetail.json());
  });

  it("allocates unique stable project numbers for concurrent creates", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);

    const responses = await Promise.all([
      createPasteProject(harness, cookie, { title: "Concurrent A", text: "First" }),
      createPasteProject(harness, cookie, { title: "Concurrent B", text: "Second" }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    expect(responses.map((response) => response.json().volumeNumber).sort()).toEqual([1, 2]);
    expect(harness.database.prepare(`
      SELECT project_number FROM projects ORDER BY project_number
    `).all()).toEqual([{ project_number: 1 }, { project_number: 2 }]);
  });

  it("derives project status from step rows instead of storing it on the project", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);
    const created = await createPasteProject(harness, cookie);
    const projectId = created.json().id as string;

    expect(harness.database.prepare("PRAGMA table_info(projects)").all())
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "status" })]));
    harness.database.prepare(`
      UPDATE pipeline_steps
      SET status = 'failed', attempt_count = 1
      WHERE project_id = ? AND ordinal = 1
    `).run(projectId);
    const inProgress = await harness.app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
      headers: { cookie },
    });
    expect(inProgress.json()).toMatchObject({ status: "in_progress", completedStepCount: 0 });

    harness.database.prepare(`
      UPDATE pipeline_steps SET status = 'succeeded', attempt_count = 1 WHERE project_id = ?
    `).run(projectId);
    const done = await harness.app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
      headers: { cookie },
    });
    expect(done.json()).toMatchObject({ status: "done", completedStepCount: 5 });
  });

  it("never uses a path-like original filename as a storage path", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);
    const response = await createUploadProject(harness, cookie, {
      filename: "../../escape.txt",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("Contained manuscript."),
    });

    expect(response.statusCode).toBe(201);
    const row = harness.database.prepare("SELECT source_path FROM projects").get() as {
      source_path: string;
    };
    expect(row.source_path).toMatch(/^users\/[0-9a-f-]+\/projects\/[0-9a-f-]+\/source\/book\.txt$/u);
    await expect(access(join(harness.temporaryDirectory, "escape.txt"))).rejects.toThrow();
  });

  it("compensates a database failure by removing the newly written project directory", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const session = await signIn(harness);
    const userId = session.response.json().user.id as string;
    const expectedProjectId = "00000000-0000-4000-8000-000000000002";
    harness.database.exec(`
      CREATE TRIGGER reject_project_insert
      BEFORE INSERT ON projects
      BEGIN
        SELECT RAISE(FAIL, 'simulated database failure');
      END;
    `);

    const response = await createPasteProject(harness, session.cookie);
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
    });
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM projects").get())
      .toEqual({ count: 0 });
    await expect(access(join(
      harness.config.DATA_DIR,
      "users",
      userId,
      "projects",
      expectedProjectId,
    ))).rejects.toThrow();
  });

  it("preserves the authenticated project and full source across app/database restart", async () => {
    const first = await createTestHarness();
    let second: TestHarness | undefined;

    try {
      const session = await signIn(first);
      const created = await createPasteProject(first, session.cookie, {
        title: "Persistent volume",
        text: "Persistent manuscript\r\nwith every line.",
      });
      const projectId = created.json().id as string;
      await first.app.close();

      second = await createTestHarness({ temporaryDirectory: first.temporaryDirectory });
      const restoredSession = await second.app.inject({
        method: "GET",
        url: "/api/session",
        headers: { cookie: session.cookie },
      });
      const detail = await second.app.inject({
        method: "GET",
        url: `/api/projects/${projectId}`,
        headers: { cookie: session.cookie },
      });
      const manuscript = await second.app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/manuscript`,
        headers: { cookie: session.cookie },
      });

      expect(restoredSession.statusCode).toBe(200);
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ id: projectId, title: "Persistent volume" });
      expect(manuscript.json()).toEqual({ text: "Persistent manuscript\nwith every line." });
    } finally {
      if (second) await second.cleanup();
      await first.cleanup();
    }
  });

  it("does not expose the private data root as static HTTP content", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);
    const project = await createPasteProject(harness, cookie, { text: "Private marker text." });
    const row = harness.database.prepare("SELECT source_path FROM projects WHERE id = ?")
      .get(project.json().id) as { source_path: string };

    const response = await harness.app.inject({
      method: "GET",
      url: `/data/${row.source_path}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("Private marker text.");
  });
});
