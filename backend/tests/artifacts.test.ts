import { afterEach, describe, expect, it } from "vitest";
import type { PipelineStepOrdinal } from "@gradion-folio/contracts";
import { ArtifactStorageError, LocalArtifactStore } from "../src/storage/local-artifact-store.js";
import { createPasteProject, signIn } from "./helpers/api.js";
import { VALID_PNG_FIXTURE } from "./helpers/fakes.js";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

const VALID_JPEG = {
  mimeType: "image/jpeg" as const,
  bytes: Uint8Array.from(Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
    "base64",
  )),
};

const VALID_WEBP = (() => {
  const bytes = Buffer.alloc(26);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(18, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8L", 12, "ascii");
  bytes.writeUInt32LE(5, 16);
  bytes[20] = 0x2f;
  return { mimeType: "image/webp" as const, bytes: Uint8Array.from(bytes) };
})();

const PATH_INPUT = {
  userId: "00000000-0000-4000-8000-000000000101",
  projectId: "00000000-0000-4000-8000-000000000102",
  kind: "portraits" as const,
  itemId: "00000000-0000-4000-8000-000000000103",
};

async function runStep(
  harness: TestHarness,
  cookie: string,
  projectId: string,
  ordinal: PipelineStepOrdinal,
) {
  return harness.app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/steps/${ordinal}/run`,
    headers: { cookie },
    payload: {},
  });
}

describe("private local artifacts", () => {
  it("atomically stores and verifies valid PNG, JPEG, and WebP images", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const store = new LocalArtifactStore(harness.temporaryDirectory, 1_024 * 1_024);

    for (const [index, image] of [VALID_PNG_FIXTURE, VALID_JPEG, VALID_WEBP].entries()) {
      const stored = await store.writeImage({
        ...PATH_INPUT,
        attemptId: `attempt-${index}`,
        image,
      });
      expect(stored.relativePath).toMatch(/^users\//u);
      expect(stored.relativePath).not.toContain("..");
      const reread = await store.readImage(stored.relativePath, stored);
      expect(reread.mimeType).toBe(image.mimeType);
      expect(reread.bytes).toEqual(image.bytes);
    }
  });

  it("rejects empty, malformed, mismatched, oversized, text, and traversal inputs", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const store = new LocalArtifactStore(harness.temporaryDirectory, 1_024 * 1_024);
    const oversizedStore = new LocalArtifactStore(
      harness.temporaryDirectory,
      VALID_PNG_FIXTURE.bytes.byteLength - 1,
    );
    const write = (image: { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg" | "image/webp" }) => (
      store.writeImage({ ...PATH_INPUT, attemptId: "attempt-validation", image })
    );

    await expect(write({ bytes: new Uint8Array(), mimeType: "image/png" }))
      .rejects.toMatchObject({ code: "NO_IMAGE" });
    await expect(write({
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimeType: "image/png",
    })).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_TYPE" });
    await expect(write({ ...VALID_PNG_FIXTURE, mimeType: "image/jpeg" }))
      .rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_TYPE" });
    await expect(oversizedStore.writeImage({
      ...PATH_INPUT,
      attemptId: "attempt-oversized",
      image: VALID_PNG_FIXTURE,
    }))
      .rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    await expect(write({ bytes: new TextEncoder().encode("<html>not an image</html>"), mimeType: "image/png" }))
      .rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_TYPE" });
    await expect(store.readImage("../../outside.png", {
      mimeType: "image/png",
      byteCount: 1,
      sha256: "0".repeat(64),
    })).rejects.toBeInstanceOf(ArtifactStorageError);
    await expect(store.writeImage({
      ...PATH_INPUT,
      itemId: "../outside",
      attemptId: "attempt-traversal",
      image: VALID_PNG_FIXTURE,
    })).rejects.toMatchObject({ code: "LOCAL_IO_ERROR" });
  });

  it("serves only fenced owner associations and makes foreign and missing artifacts identical", async () => {
    const harness = await createTestHarness({ useGeminiStepExecutor: true });
    harnesses.push(harness);
    const owner = await signIn(harness, { email: "owner@example.com" });
    const project = await createPasteProject(harness, owner.cookie);
    const projectId = project.json().id as string;
    for (const ordinal of [1, 2, 3, 4, 5] as const) {
      const response = await runStep(harness, owner.cookie, projectId, ordinal);
      expect(response.statusCode, response.body).toBe(200);
    }
    const detail = (await harness.app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
      headers: { cookie: owner.cookie },
    })).json();
    const portraitUrl = detail.characters[0].portraitUrl as string;
    const illustrationUrl = detail.chapters[0].illustrationUrl as string;

    for (const url of [portraitUrl, illustrationUrl]) {
      const response = await harness.app.inject({ method: "GET", url, headers: { cookie: owner.cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
      expect(response.rawPayload).toEqual(Buffer.from(VALID_PNG_FIXTURE.bytes));
    }

    const foreign = await signIn(harness, { email: "foreign@example.com" });
    const missingProjectId = "99999999-9999-4999-8999-999999999999";
    const foreignResponse = await harness.app.inject({
      method: "GET",
      url: portraitUrl,
      headers: { cookie: foreign.cookie },
    });
    const missingResponse = await harness.app.inject({
      method: "GET",
      url: portraitUrl.replace(projectId, missingProjectId),
      headers: { cookie: owner.cookie },
    });
    expect(foreignResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(foreignResponse.json()).toEqual(missingResponse.json());

    harness.database.prepare(`
      UPDATE characters SET portrait_path = '../../outside.png'
      WHERE project_id = ? AND position = 0
    `).run(projectId);
    const traversal = await harness.app.inject({
      method: "GET",
      url: portraitUrl,
      headers: { cookie: owner.cookie },
    });
    expect(traversal.statusCode).toBe(404);
    expect(traversal.json()).toEqual(missingResponse.json());
  });
});
