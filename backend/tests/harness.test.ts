import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  imageInteractionId,
  textInteractionId,
  type PortraitResult,
} from "../src/integrations/gemini/gateway.js";
import {
  FakeClock,
  FakeGeminiGateway,
  MALFORMED_PNG_FIXTURE,
  VALID_PNG_FIXTURE,
  createDeferred,
} from "./helpers/fakes.js";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

const character = {
  name: "Mole",
  role: "The curious homebody",
  ageGroup: "adult" as const,
  prompt: "A complete adult character portrait brief.",
};

function portraitResult(characterId: string, suffix: string): PortraitResult {
  return {
    characterId,
    image: VALID_PNG_FIXTURE,
    provider: {
      modelId: "fake-image-model",
      requestId: `request-${suffix}`,
      interactionId: imageInteractionId(`image-${suffix}`),
    },
  };
}

function portraitInput(characterId: string) {
  return {
    characterId,
    character,
    style: "Ink and watercolour",
    previousImageInteractionId: imageInteractionId("image-context-0001"),
  };
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("deterministic backend test harness", () => {
  it("advances fake time without waiting", () => {
    const clock = new FakeClock("2026-08-13T10:00:00.000Z");
    clock.advance(45_000);
    expect(clock.now().toISOString()).toBe("2026-08-13T10:00:45.000Z");
  });

  it("records checkpointable provider calls, call indexes, and provenance", async () => {
    const gemini = new FakeGeminiGateway();
    const upload = await gemini.uploadSource({
      projectId: "project-1",
      originalName: "manuscript.txt",
      bytes: new TextEncoder().encode("Text"),
      mimeType: "text/plain",
    });
    const context = await gemini.createBookContext({
      projectId: "project-1",
      source: upload.file,
    });
    const style = await gemini.defineStyle({
      previousInteractionId: context.provider.interactionId,
    });

    expect(upload.file).toMatchObject({
      providerFileName: "files/source-0001",
      uri: "https://provider.invalid/files/source-0001",
    });
    expect(context.provider).toMatchObject({
      modelId: "fake-text-model",
      requestId: "request-book-0001",
      interactionId: "text-book-0001",
    });
    expect(style).toMatchObject({
      style: "Deterministic ink and watercolour style.",
      provider: { interactionId: "text-style-0001" },
    });
    expect(gemini.operations.map(({ sequence, name, callIndex }) => ({ sequence, name, callIndex })))
      .toEqual([
        { sequence: 1, name: "uploadSource", callIndex: 1 },
        { sequence: 2, name: "createBookContext", callIndex: 1 },
        { sequence: 3, name: "defineStyle", callIndex: 1 },
      ]);
  });

  it("models partial portrait success, failure, and a successful FIFO retry", async () => {
    const failure = new Error("deterministic portrait failure");
    const firstSuccess = portraitResult("character-1", "portrait-first");
    const retrySuccess = portraitResult("character-2", "portrait-retry");
    const gemini = new FakeGeminiGateway({
      scripts: {
        generatePortrait: [
          { kind: "success", value: firstSuccess },
          { kind: "error", error: failure },
          { kind: "success", value: retrySuccess },
        ],
      },
    });

    await expect(gemini.generatePortrait(portraitInput("character-1"))).resolves
      .toEqual(firstSuccess);
    await expect(gemini.generatePortrait(portraitInput("character-2"))).rejects.toBe(failure);
    await expect(gemini.generatePortrait(portraitInput("character-2"))).resolves
      .toEqual(retrySuccess);
    expect(gemini.operations.map(({ name, callIndex }) => ({ name, callIndex }))).toEqual([
      { name: "generatePortrait", callIndex: 1 },
      { name: "generatePortrait", callIndex: 2 },
      { name: "generatePortrait", callIndex: 3 },
    ]);
  });

  it("holds an in-flight call behind a manual gate and permits a later call to finish first", async () => {
    const gate = createDeferred<PortraitResult>();
    const firstResult = portraitResult("character-1", "portrait-late");
    const secondResult = portraitResult("character-2", "portrait-fast");
    const gemini = new FakeGeminiGateway({
      scripts: {
        generatePortrait: [
          { kind: "deferred", deferred: gate },
          { kind: "success", value: secondResult },
        ],
      },
    });

    const firstCall = gemini.generatePortrait(portraitInput("character-1"));
    await expect(gemini.generatePortrait(portraitInput("character-2"))).resolves
      .toEqual(secondResult);
    expect(gemini.operations.map(({ callIndex }) => callIndex)).toEqual([1, 2]);

    gate.resolve(firstResult);
    await expect(firstCall).resolves.toEqual(firstResult);
  });

  it("provides a real tiny PNG, a malformed fixture, and malformed scripted output", async () => {
    expect([...VALID_PNG_FIXTURE.bytes.slice(0, 8)])
      .toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(VALID_PNG_FIXTURE.bytes.length).toBeGreaterThan(MALFORMED_PNG_FIXTURE.bytes.length);

    const gemini = new FakeGeminiGateway({
      scripts: {
        generateIllustration: [{
          kind: "malformed",
          value: { image: MALFORMED_PNG_FIXTURE },
        }],
      },
    });
    const result = await gemini.generateIllustration({
      style: "Ink and watercolour",
      chapter: {
        name: "The Riverbank",
        prompt: "A single-scene illustration brief.",
        characterNames: ["Mole"],
      },
      portraitReferences: [{
        characterId: "character-1",
        characterName: "Mole",
        image: VALID_PNG_FIXTURE,
      }],
    });

    expect(result).toEqual({ image: MALFORMED_PNG_FIXTURE });
    expect(gemini.operations[0]?.input).toMatchObject({
      portraitReferences: [{ characterId: "character-1", characterName: "Mole" }],
    });
    expect(gemini.operations[0]?.input).not.toHaveProperty("previousImageInteractionId");
  });

  it("constructs isolated app instances, IDs, gateways, and temporary roots", async () => {
    const first = await createTestHarness();
    const second = await createTestHarness();
    harnesses.push(first, second);

    await first.gemini.uploadSource({
      projectId: "first",
      originalName: "one.txt",
      bytes: new TextEncoder().encode("One"),
      mimeType: "text/plain",
    });
    const responses = await Promise.all([
      first.app.inject({ method: "GET", url: "/api/health" }),
      second.app.inject({ method: "GET", url: "/api/health" }),
    ]);

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
    expect(first.temporaryDirectory).not.toBe(second.temporaryDirectory);
    expect(first.ids.generate()).toBe("00000000-0000-4000-8000-000000000001");
    expect(second.ids.generate()).toBe("00000000-0000-4000-8000-000000000001");
    expect(first.gemini.operations).toHaveLength(1);
    expect(second.gemini.operations).toHaveLength(0);
  });

  it("removes its temporary root if harness construction fails", async () => {
    const parent = await mkdtemp(join(tmpdir(), "gradion-harness-parent-"));

    try {
      await expect(createTestHarness({
        temporaryDirectoryParent: parent,
        environment: { PORT: "invalid" },
      })).rejects.toThrow("PORT");
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("retains semantic text and image interaction ID boundaries", () => {
    expect(textInteractionId("text-1")).toBe("text-1");
    expect(imageInteractionId("image-1")).toBe("image-1");
    expect(() => textInteractionId(" ")).toThrow("must not be empty");
    expect(() => imageInteractionId("")).toThrow("must not be empty");
  });
});
