import { afterEach, describe, expect, it } from "vitest";
import type { PipelineStepOrdinal } from "@gradion-folio/contracts";
import { createPasteProject, signIn } from "./helpers/api.js";
import { FakeGeminiGateway } from "./helpers/fakes.js";
import { textInteractionId } from "../src/integrations/gemini/gateway.js";
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
) {
  return harness.app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/steps/${ordinal}/run`,
    headers: { cookie },
    payload: {},
  });
}

describe("Phase 3 deterministic five-stage pipeline", () => {
  it("completes all stages with one source upload, durable contexts, and private artifacts", async () => {
    const first = await createTestHarness({ useGeminiStepExecutor: true });
    let restarted: TestHarness | undefined;

    try {
      const session = await signIn(first);
      const created = await createPasteProject(first, session.cookie, {
        title: "The River Book",
        text: "A public-domain river story used only by the deterministic fake pipeline.",
      });
      const projectId = created.json().id as string;

      for (const ordinal of [1, 2, 3, 4, 5] as const) {
        const response = await runStep(first, session.cookie, projectId, ordinal);
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().disposition).toBe("succeeded");
      }

      const detail = await first.app.inject({
        method: "GET",
        url: `/api/projects/${projectId}`,
        headers: { cookie: session.cookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        status: "done",
        completedStepCount: 5,
        style: "Deterministic ink and watercolour style.",
      });
      expect(detail.json().characters).toHaveLength(2);
      expect(detail.json().characters.every((character: { portraitState: string }) => (
        character.portraitState === "succeeded"
      ))).toBe(true);
      expect(detail.json().chapters).toHaveLength(1);
      expect(detail.json().chapters[0].illustrationState).toBe("succeeded");

      expect(first.gemini.operations.map(({ name }) => name)).toEqual([
        "uploadSource",
        "createBookContext",
        "defineStyle",
        "extractCharacters",
        "createImageContext",
        "generatePortrait",
        "generatePortrait",
        "extractChapter",
        "generateIllustration",
      ]);
      expect(first.gemini.operations.filter(({ name }) => name === "uploadSource")).toHaveLength(1);
      expect(first.gemini.operations.filter(({ name }) => name === "generatePortrait")).toHaveLength(2);
      expect(first.gemini.operations.filter(({ name }) => name === "generateIllustration")).toHaveLength(1);

      const characterCall = first.gemini.operations.find(({ name }) => name === "extractCharacters");
      const stageOneInteraction = first.database.prepare(`
        SELECT interaction_id FROM pipeline_steps WHERE project_id = ? AND ordinal = 1
      `).get(projectId) as { interaction_id: string };
      expect(characterCall?.input).toMatchObject({
        previousInteractionId: stageOneInteraction.interaction_id,
      });
      const portraitCalls = first.gemini.operations.filter(({ name }) => name === "generatePortrait");
      expect(portraitCalls[0]?.input).toMatchObject({
        previousImageInteractionId: "image-context-0001",
      });
      expect(portraitCalls[1]?.input).toMatchObject({
        previousImageInteractionId: "image-portrait-0001",
      });

      const laterInputs = first.gemini.operations.slice(1).map(({ input }) => input);
      expect(laterInputs.some((input) => JSON.stringify(input).includes("public-domain river story")))
        .toBe(false);
      const chapterCall = first.gemini.operations.find(({ name }) => name === "extractChapter");
      const stageTwoInteraction = first.database.prepare(`
        SELECT interaction_id FROM pipeline_steps WHERE project_id = ? AND ordinal = 2
      `).get(projectId) as { interaction_id: string };
      expect(chapterCall?.input).toMatchObject({
        previousInteractionId: stageTwoInteraction.interaction_id,
      });
      const illustrationCall = first.gemini.operations.at(-1);
      expect(illustrationCall?.name).toBe("generateIllustration");
      expect(illustrationCall?.input).not.toHaveProperty("previousInteractionId");
      expect((illustrationCall?.input as { portraitReferences: unknown[] }).portraitReferences)
        .toHaveLength(2);

      expect(first.database.prepare(`
        SELECT status, COUNT(*) AS count
        FROM provider_operations
        GROUP BY status
      `).all()).toEqual([{ status: "succeeded", count: 9 }]);
      expect(first.database.prepare(`
        SELECT prompt_version, COUNT(*) AS count
        FROM provider_operations
        WHERE prompt_version IN ('portrait.v2', 'illustration.v2')
        GROUP BY prompt_version
        ORDER BY prompt_version
      `).all()).toEqual([
        { prompt_version: "illustration.v2", count: 1 },
        { prompt_version: "portrait.v2", count: 2 },
      ]);

      const artifacts = first.database.prepare(`
        SELECT portrait_path AS path, portrait_mime AS mime, portrait_bytes AS bytes,
               portrait_sha256 AS sha
        FROM characters WHERE project_id = ?
        UNION ALL
        SELECT illustration_path, illustration_mime, illustration_bytes, illustration_sha256
        FROM chapters WHERE project_id = ?
      `).all(projectId, projectId) as Array<{
        path: string;
        mime: string;
        bytes: number;
        sha: string;
      }>;
      expect(artifacts).toHaveLength(3);
      for (const artifact of artifacts) {
        const image = await first.artifactFiles.readImage(artifact.path, {
          mimeType: artifact.mime,
          byteCount: artifact.bytes,
          sha256: artifact.sha,
        });
        expect(image.bytes.byteLength).toBeGreaterThan(0);
      }

      await first.app.close();
      restarted = await createTestHarness({
        temporaryDirectory: first.temporaryDirectory,
        useGeminiStepExecutor: true,
      });
      const afterRestart = await restarted.app.inject({
        method: "GET",
        url: `/api/projects/${projectId}`,
        headers: { cookie: session.cookie },
      });
      expect(afterRestart.statusCode).toBe(200);
      expect(afterRestart.json()).toMatchObject({ status: "done", completedStepCount: 5 });
      expect(afterRestart.json().characters).toHaveLength(2);
      expect(afterRestart.json().chapters).toHaveLength(1);
      const restartedArtifactUrls = [
        ...afterRestart.json().characters.map((character: { portraitUrl: string }) => character.portraitUrl),
        afterRestart.json().chapters[0].illustrationUrl,
      ];
      for (const url of restartedArtifactUrls) {
        const artifact = await restarted.app.inject({
          method: "GET",
          url,
          headers: { cookie: session.cookie },
        });
        expect(artifact.statusCode).toBe(200);
        expect(artifact.headers["content-type"]).toBe("image/png");
        expect(artifact.rawPayload.byteLength).toBeGreaterThan(0);
      }
    } finally {
      if (restarted) await restarted.cleanup();
      await first.cleanup();
    }
  });

  it("supports a one-adult project without assuming a second portrait", async () => {
    const gateway = new FakeGeminiGateway();
    gateway.enqueue("extractCharacters", { kind: "success", value: {
      characters: [{
        name: "Mole",
        role: "The adult lead",
        ageGroup: "adult",
        prompt: "Create a full-length adult Mole beside a calm spring river, wearing practical earth-toned country clothes and holding a worn walking stick. Render velvety charcoal fur, a rounded muzzle, thoughtful dark eyes, carefully observed fabric, grounded proportions, expressive natural posture, soft rim light, watercolor paper texture, fine ink contours, and a gentle but uncertain emotional presence throughout this coherent standalone character portrait design.",
      }],
      provider: {
        modelId: "fake-text-model",
        interactionId: textInteractionId("one-adult-characters"),
      },
    } });
    const harness = await createTestHarness({ gemini: gateway, useGeminiStepExecutor: true });
    try {
      const session = await signIn(harness);
      const created = await createPasteProject(harness, session.cookie);
      const projectId = created.json().id as string;

      for (const ordinal of [1, 2, 3, 4, 5] as const) {
        const response = await runStep(harness, session.cookie, projectId, ordinal);
        expect(response.statusCode, response.body).toBe(200);
      }
      expect(gateway.operations.filter(({ name }) => name === "generatePortrait")).toHaveLength(1);
      const illustration = gateway.operations.find(({ name }) => name === "generateIllustration");
      expect((illustration?.input as { portraitReferences: unknown[] }).portraitReferences)
        .toHaveLength(1);
      expect(harness.database.prepare(`
        SELECT COUNT(*) AS count FROM characters WHERE project_id = ?
      `).get(projectId)).toEqual({ count: 1 });
    } finally {
      await harness.cleanup();
    }
  });
});
