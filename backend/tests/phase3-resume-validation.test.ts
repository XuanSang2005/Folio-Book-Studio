import { afterEach, describe, expect, it, vi } from "vitest";
import type { PipelineStepOrdinal } from "@gradion-folio/contracts";
import {
  GeminiGatewayError,
  imageInteractionId,
  textInteractionId,
} from "../src/integrations/gemini/gateway.js";
import { createPasteProject, signIn } from "./helpers/api.js";
import {
  FakeGeminiGateway,
  VALID_PNG_FIXTURE,
  createDeferred,
} from "./helpers/fakes.js";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

async function runStep(
  harness: TestHarness,
  cookie: string,
  projectId: string,
  ordinal: PipelineStepOrdinal,
  payload: Record<string, unknown> = {},
) {
  return harness.app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/steps/${ordinal}/run`,
    headers: { cookie },
    payload,
  });
}

async function recoverStep(
  harness: TestHarness,
  cookie: string,
  projectId: string,
  ordinal: PipelineStepOrdinal,
) {
  return harness.app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/steps/${ordinal}/recover`,
    headers: { cookie },
  });
}

async function projectFixture(gemini = new FakeGeminiGateway()) {
  const harness = await createTestHarness({ gemini, useGeminiStepExecutor: true });
  harnesses.push(harness);
  const session = await signIn(harness);
  const created = await createPasteProject(harness, session.cookie, {
    text: "The manuscript remains local and should be uploaded at most once.",
  });
  return {
    harness,
    cookie: session.cookie,
    projectId: created.json().id as string,
  };
}

const FAILURE = new GeminiGatewayError("PROVIDER_UNAVAILABLE", "Provider unavailable.", 503);

const VALID_CHARACTERS = [{
  name: "Mole",
  role: "Lead",
  ageGroup: "adult" as const,
  prompt: "Create an adult Mole character standing beside a river in practical country clothing with careful fabric texture, velvety fur, thoughtful eyes, grounded proportions, and a clear full-body silhouette. Use warm daylight, fine ink contours, layered watercolor washes, subtle rim light, expressive natural posture, a worn walking stick, soft landscape atmosphere, and a kind but uncertain emotional presence throughout this detailed portrait design.",
}];

describe("Phase 3 resume, validation, and spend discipline", () => {
  it("resumes after upload and book checkpoints without repeating completed provider calls", async () => {
    const gateway = new FakeGeminiGateway({ scripts: {
      createBookContext: [{ kind: "error", error: FAILURE }],
      defineStyle: [{ kind: "error", error: FAILURE }],
    } });
    const { harness, cookie, projectId } = await projectFixture(gateway);

    const failedBook = await runStep(harness, cookie, projectId, 1);
    expect(failedBook.statusCode).toBe(503);
    expect(gateway.operations.map(({ name }) => name)).toEqual(["uploadSource", "createBookContext"]);
    expect(harness.database.prepare(`
      SELECT gemini_file_name, gemini_file_uri, book_interaction_id
      FROM projects WHERE id = ?
    `).get(projectId)).toMatchObject({
      gemini_file_name: expect.any(String),
      gemini_file_uri: expect.any(String),
      book_interaction_id: null,
    });

    const failedStyle = await runStep(harness, cookie, projectId, 1);
    expect(failedStyle.statusCode).toBe(503);
    expect(gateway.operations.map(({ name }) => name)).toEqual([
      "uploadSource",
      "createBookContext",
      "createBookContext",
      "defineStyle",
    ]);
    expect(harness.database.prepare(`
      SELECT book_interaction_id FROM projects WHERE id = ?
    `).get(projectId)).toMatchObject({ book_interaction_id: expect.any(String) });

    const completed = await runStep(harness, cookie, projectId, 1);
    expect(completed.statusCode).toBe(200);
    expect(gateway.operations.filter(({ name }) => name === "uploadSource")).toHaveLength(1);
    expect(gateway.operations.filter(({ name }) => name === "createBookContext")).toHaveLength(2);
    expect(gateway.operations.filter(({ name }) => name === "defineStyle")).toHaveLength(2);
  });

  it("persists supplied art direction and makes no style-generation call", async () => {
    const { harness, cookie, projectId } = await projectFixture();
    const response = await runStep(harness, cookie, projectId, 1, {
      artDirection: "User-authored graphite and wash direction.",
    });
    expect(response.statusCode).toBe(200);
    expect(harness.gemini.operations.map(({ name }) => name)).toEqual([
      "uploadSource",
      "createBookContext",
    ]);
    expect(harness.database.prepare(`
      SELECT style_text, style_source FROM projects WHERE id = ?
    `).get(projectId)).toEqual({
      style_text: "User-authored graphite and wash direction.",
      style_source: "user",
    });
  });

  it.each([
    ["malformed result", { notCharacters: true }],
    ["zero adults", { characters: [] }],
    ["child", { characters: [{ ...VALID_CHARACTERS[0]!, ageGroup: "child" }] }],
    ["three characters", { characters: [
      VALID_CHARACTERS[0],
      { ...VALID_CHARACTERS[0], name: "Rat" },
      { ...VALID_CHARACTERS[0], name: "Badger" },
    ] }],
    ["short prompt", { characters: [{ ...VALID_CHARACTERS[0]!, prompt: "Too short." }] }],
  ])("rejects %s character output without committing rows", async (_label, malformed) => {
    const gateway = new FakeGeminiGateway();
    gateway.enqueue("extractCharacters", { kind: "malformed", value: malformed });
    const { harness, cookie, projectId } = await projectFixture(gateway);
    expect((await runStep(harness, cookie, projectId, 1)).statusCode).toBe(200);

    const response = await runStep(harness, cookie, projectId, 2);
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("INVALID_MODEL_OUTPUT");
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM characters WHERE project_id = ?")
      .get(projectId)).toEqual({ count: 0 });
  });

  it.each([
    ["two chapters", [
      {
        name: "One",
        prompt: "Illustrate one complete riverbank scene with detailed adult character staging, natural daylight, textured watercolor washes, careful ink contours, clear landscape depth, consistent clothing, expressive posture, and one cohesive full-page composition without lettering, borders, captions, panels, or unrelated figures anywhere in the finished image.",
        characterNames: ["Mole"],
      },
      {
        name: "Two",
        prompt: "Illustrate another complete riverbank scene with detailed adult character staging, natural daylight, textured watercolor washes, careful ink contours, clear landscape depth, consistent clothing, expressive posture, and one cohesive full-page composition without lettering, borders, captions, panels, or unrelated figures anywhere in the finished image.",
        characterNames: ["Mole"],
      },
    ]],
    ["an unknown cast member", [{
      name: "Unknown",
      prompt: "Illustrate one complete riverbank scene with detailed adult character staging, natural daylight, textured watercolor washes, careful ink contours, clear landscape depth, consistent clothing, expressive posture, and one cohesive full-page composition without lettering, borders, captions, panels, or unrelated figures anywhere in the finished image.",
      characterNames: ["Unknown Person"],
    }]],
  ])("rejects %s without committing chapter rows", async (_label, chapters) => {
    const gateway = new FakeGeminiGateway();
    gateway.enqueue("extractCharacters", { kind: "success", value: {
      characters: VALID_CHARACTERS,
      provider: {
        modelId: "fake-text-model",
        interactionId: textInteractionId("characters-validation"),
      },
    } });
    gateway.enqueue("extractChapter", { kind: "malformed", value: { chapters } });
    const { harness, cookie, projectId } = await projectFixture(gateway);
    for (const ordinal of [1, 2, 3] as const) {
      expect((await runStep(harness, cookie, projectId, ordinal)).statusCode).toBe(200);
    }
    const response = await runStep(harness, cookie, projectId, 4);
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("INVALID_MODEL_OUTPUT");
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM chapters WHERE project_id = ?")
      .get(projectId)).toEqual({ count: 0 });
    expect(harness.database.prepare(`
      SELECT COUNT(*) AS count FROM characters
      WHERE project_id = ? AND portrait_status = 'succeeded'
    `).get(projectId)).toEqual({ count: 1 });
  });

  it("preserves portrait one, fails portrait two, and retries only portrait two", async () => {
    const gateway = new FakeGeminiGateway();
    const { harness, cookie, projectId } = await projectFixture(gateway);
    for (const ordinal of [1, 2] as const) {
      expect((await runStep(harness, cookie, projectId, ordinal)).statusCode).toBe(200);
    }
    const characterIds = harness.database.prepare(`
      SELECT id FROM characters WHERE project_id = ? ORDER BY position
    `).all(projectId) as Array<{ id: string }>;
    const firstId = characterIds[0]!.id;
    gateway.enqueue("generatePortrait", { kind: "success", value: {
      characterId: firstId,
      image: VALID_PNG_FIXTURE,
      provider: {
        modelId: "fake-image-model",
        interactionId: imageInteractionId("portrait-one-replaced-script"),
      },
    } });
    gateway.enqueue("generatePortrait", { kind: "error", error: FAILURE });

    const failed = await runStep(harness, cookie, projectId, 3);
    expect(failed.statusCode).toBe(503);
    const afterFailure = harness.database.prepare(`
      SELECT id, portrait_status, portrait_path, portrait_sha256
      FROM characters WHERE project_id = ? ORDER BY position
    `).all(projectId) as Array<{
      id: string;
      portrait_status: string;
      portrait_path: string | null;
      portrait_sha256: string | null;
    }>;
    expect(afterFailure.map(({ portrait_status }) => portrait_status)).toEqual(["succeeded", "failed"]);
    const preserved = afterFailure[0]!;

    gateway.enqueue("generatePortrait", { kind: "success", value: {
      characterId: characterIds[1]!.id,
      image: VALID_PNG_FIXTURE,
      provider: {
        modelId: "fake-image-model",
        interactionId: imageInteractionId("portrait-two-retry"),
      },
    } });
    const retried = await runStep(harness, cookie, projectId, 3);
    expect(retried.statusCode, retried.body).toBe(200);
    const afterRetry = harness.database.prepare(`
      SELECT id, portrait_status, portrait_path, portrait_sha256
      FROM characters WHERE project_id = ? ORDER BY position
    `).all(projectId) as typeof afterFailure;
    expect(afterRetry[0]).toEqual(preserved);
    expect(afterRetry[1]!.portrait_status).toBe("succeeded");
    expect(gateway.operations.filter(({ name }) => name === "generatePortrait")).toHaveLength(3);
    expect(gateway.operations.filter(({ name }) => name === "createImageContext")).toHaveLength(1);
  });

  it("rejects a late stale portrait checkpoint and stops before portrait two", async () => {
    const deferred = createDeferred<{
      characterId: string;
      image: typeof VALID_PNG_FIXTURE;
      provider: {
        modelId: string;
        interactionId: ReturnType<typeof imageInteractionId>;
      };
    }>();
    const gateway = new FakeGeminiGateway();
    gateway.enqueue("generatePortrait", { kind: "deferred", deferred });
    const { harness, cookie, projectId } = await projectFixture(gateway);
    for (const ordinal of [1, 2] as const) {
      expect((await runStep(harness, cookie, projectId, ordinal)).statusCode).toBe(200);
    }
    const characters = harness.database.prepare(`
      SELECT id FROM characters WHERE project_id = ? ORDER BY position
    `).all(projectId) as Array<{ id: string }>;

    const inFlight = runStep(harness, cookie, projectId, 3);
    await vi.waitFor(() => {
      expect(gateway.operations.filter(({ name }) => name === "generatePortrait")).toHaveLength(1);
    });
    harness.clock.advance(harness.config.STEP_LEASE_MS + 1);
    expect((await recoverStep(harness, cookie, projectId, 3)).statusCode).toBe(200);

    deferred.resolve({
      characterId: characters[0]!.id,
      image: VALID_PNG_FIXTURE,
      provider: {
        modelId: "fake-image-model",
        interactionId: imageInteractionId("late-portrait"),
      },
    });
    const stale = await inFlight;
    expect(stale.statusCode).toBe(200);
    expect(stale.json().disposition).toBe("stale");
    expect(gateway.operations.filter(({ name }) => name === "generatePortrait")).toHaveLength(1);
    expect(harness.database.prepare(`
      SELECT COUNT(*) AS count FROM characters
      WHERE project_id = ? AND portrait_status = 'succeeded'
    `).get(projectId)).toEqual({ count: 0 });
    expect(harness.database.prepare(`
      SELECT status FROM provider_operations
      WHERE project_id = ? AND operation_key LIKE 'portrait:%'
    `).all(projectId)).toEqual([{ status: "abandoned" }]);
  });

  it("reconciles completed portraits and a valid final illustration without provider calls", async () => {
    const { harness, cookie, projectId } = await projectFixture();
    for (const ordinal of [1, 2, 3, 4, 5] as const) {
      expect((await runStep(harness, cookie, projectId, ordinal)).statusCode).toBe(200);
    }
    const initialCalls = harness.gemini.operations.length;
    const now = harness.clock.now().getTime();

    harness.database.prepare(`
      UPDATE pipeline_steps
      SET status = 'failed', active_attempt_id = NULL, completed_at = ?,
          error_code = 'PROCESS_INTERRUPTED', error_message = 'Interrupted.', updated_at = ?
      WHERE project_id = ? AND ordinal = 5
    `).run(now, now, projectId);
    const illustration = await runStep(harness, cookie, projectId, 5);
    expect(illustration.statusCode).toBe(200);
    expect(harness.gemini.operations).toHaveLength(initialCalls);

    harness.database.prepare(`
      UPDATE pipeline_steps
      SET status = 'failed', active_attempt_id = NULL, completed_at = ?,
          error_code = 'PROCESS_INTERRUPTED', error_message = 'Interrupted.', updated_at = ?
      WHERE project_id = ? AND ordinal = 3
    `).run(now, now, projectId);
    const portraits = await runStep(harness, cookie, projectId, 3);
    expect(portraits.statusCode).toBe(200);
    expect(harness.gemini.operations).toHaveLength(initialCalls);
  });

  it("refuses portrait reconciliation when a completed file association is invalid", async () => {
    const { harness, cookie, projectId } = await projectFixture();
    for (const ordinal of [1, 2, 3] as const) {
      expect((await runStep(harness, cookie, projectId, ordinal)).statusCode).toBe(200);
    }
    const initialCalls = harness.gemini.operations.length;
    const now = harness.clock.now().getTime();
    harness.database.prepare(`
      UPDATE pipeline_steps
      SET status = 'failed', active_attempt_id = NULL, completed_at = ?,
          error_code = 'PROCESS_INTERRUPTED', error_message = 'Interrupted.', updated_at = ?
      WHERE project_id = ? AND ordinal = 3
    `).run(now, now, projectId);
    harness.database.prepare(`
      UPDATE characters SET portrait_path = '../../outside.png'
      WHERE project_id = ? AND position = 0
    `).run(projectId);

    const response = await runStep(harness, cookie, projectId, 3);
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("LOCAL_IO_ERROR");
    expect(harness.gemini.operations).toHaveLength(initialCalls);
  });

  it("returns context-expired without silently rebuilding an expired saved file", async () => {
    const { harness, cookie, projectId } = await projectFixture();
    const now = harness.clock.now().getTime();
    harness.database.prepare(`
      UPDATE projects
      SET gemini_file_name = 'files/expired', gemini_file_uri = 'https://provider.invalid/expired',
          gemini_file_expires_at = ?, book_interaction_id = NULL
      WHERE id = ?
    `).run(now - 1, projectId);

    const response = await runStep(harness, cookie, projectId, 1);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONTEXT_EXPIRED");
    expect(harness.gemini.operations).toHaveLength(0);
  });
});
