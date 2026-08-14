import {
  MAX_ADULT_CHARACTERS,
  MAX_CHAPTERS,
  PIPELINE_STEPS,
  ApiErrorEnvelopeSchema,
  ProjectDetailDtoSchema,
} from "@gradion-folio/contracts";
import { describe, expect, it } from "vitest";

describe("shared assessment contracts", () => {
  it("defines the five ordered stages and product caps once", () => {
    expect(PIPELINE_STEPS).toEqual([
      { ordinal: 1, key: "style", label: "Style", roman: "I" },
      { ordinal: 2, key: "characters", label: "Characters", roman: "II" },
      { ordinal: 3, key: "portraits", label: "Portraits", roman: "III" },
      { ordinal: 4, key: "chapters", label: "Chapters", roman: "IV" },
      { ordinal: 5, key: "illustrations", label: "Illustrations", roman: "V" },
    ]);
    expect({ MAX_ADULT_CHARACTERS, MAX_CHAPTERS }).toEqual({
      MAX_ADULT_CHARACTERS: 2,
      MAX_CHAPTERS: 1,
    });
  });

  it("rejects an unstable API error code and over-cap project details", () => {
    expect(ApiErrorEnvelopeSchema.safeParse({
      error: { code: "UNKNOWN_ERROR", message: "No stable code" },
    }).success).toBe(false);

    const validCharacter = {
      id: "character-1",
      name: "Mole",
      role: "The curious homebody",
      ageGroup: "adult",
      prompt: "A complete adult portrait brief.",
      portraitState: "pending",
      portraitUrl: null,
    };
    const project = {
      id: "project-1",
      volumeNumber: 1,
      title: "Volume",
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      status: "draft",
      sourceWordCount: 1,
      completedStepCount: 0,
      totalStepCount: 5,
      source: { mode: "paste", originalName: null, byteCount: 4, wordCount: 1 },
      style: null,
      steps: PIPELINE_STEPS.map((step) => ({
        ordinal: step.ordinal,
        key: step.key,
        status: "pending",
        visibleState: "pending",
        attemptCount: 0,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      })),
      characters: [validCharacter, { ...validCharacter, id: "character-2" }],
      chapters: [],
    };

    const validChapter = {
      id: "chapter-1",
      name: "The Riverbank",
      prompt: "A complete single-scene illustration brief.",
      characterNames: ["Mole"],
      illustrationState: "pending",
      illustrationUrl: null,
    };

    expect(ProjectDetailDtoSchema.safeParse(project).success).toBe(true);
    expect(ProjectDetailDtoSchema.safeParse({
      ...project,
      characters: [...project.characters, { ...validCharacter, id: "character-3" }],
    }).success).toBe(false);
    expect(ProjectDetailDtoSchema.safeParse({
      ...project,
      chapters: [validChapter, { ...validChapter, id: "chapter-2" }],
    }).success).toBe(false);
  });

  it("requires project step summaries to use the exact canonical ordinal/key order", () => {
    const step = (ordinal: 1 | 2 | 3 | 4 | 5, key: (typeof PIPELINE_STEPS)[number]["key"]) => ({
      ordinal,
      key,
      status: "pending",
      visibleState: "pending",
      attemptCount: 0,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    });
    const base = {
      id: "project-1",
      volumeNumber: 1,
      title: "Volume",
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      status: "draft",
      sourceWordCount: 1,
      completedStepCount: 0,
      totalStepCount: 5,
      source: { mode: "paste", originalName: null, byteCount: 4, wordCount: 1 },
      style: null,
      characters: [],
      chapters: [],
    };
    const canonical = PIPELINE_STEPS.map(({ ordinal, key }) => step(ordinal, key));

    expect(ProjectDetailDtoSchema.safeParse({ ...base, steps: canonical }).success).toBe(true);
    expect(ProjectDetailDtoSchema.safeParse({
      ...base,
      steps: [canonical[1], canonical[0], ...canonical.slice(2)],
    }).success).toBe(false);
    expect(ProjectDetailDtoSchema.safeParse({
      ...base,
      steps: canonical.map((entry, index) => index === 0 ? { ...entry, key: "chapters" } : entry),
    }).success).toBe(false);
  });
});
