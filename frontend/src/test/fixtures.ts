import {
  PIPELINE_STEPS,
  type CharacterDto,
  type ChapterDto,
  type ProjectDetailDto,
  type ProjectSummaryDto,
  type SessionDto,
  type VisibleStepState,
} from "@gradion-folio/contracts";

export const sessionFixture: SessionDto = {
  user: { id: "user-1", name: "Baseline Reader", email: "reader@example.com" },
  expiresAt: "2026-08-15T00:00:00.000Z",
};

export function stepFixtures(states: VisibleStepState[] = []) {
  return PIPELINE_STEPS.map((step, index) => {
    const visibleState = states[index] ?? "pending";
    return {
      ordinal: step.ordinal,
      key: step.key,
      status: visibleState === "stuck" ? "running" as const : visibleState,
      visibleState,
      attemptCount: visibleState === "pending" ? 0 : 1,
      startedAt: visibleState === "pending" ? null : "2026-08-14T01:00:00.000Z",
      completedAt: visibleState === "succeeded" ? "2026-08-14T01:01:00.000Z" : null,
      errorCode: visibleState === "failed" || visibleState === "stuck" ? "PROVIDER_UNAVAILABLE" as const : null,
      errorMessage: visibleState === "failed" || visibleState === "stuck" ? "The illustration press returned an error." : null,
    };
  });
}

export const characterOne: CharacterDto = {
  id: "character-1",
  name: "Mole",
  role: "The curious homebody",
  ageGroup: "adult",
  prompt: "An adult character portrait grounded in the manuscript and visual direction.",
  portraitState: "succeeded",
  portraitUrl: "/api/projects/project-1/characters/character-1/portrait",
};

export const characterTwo: CharacterDto = {
  id: "character-2",
  name: "Ratty",
  role: "The river guide",
  ageGroup: "adult",
  prompt: "A second adult character portrait grounded in the manuscript and visual direction.",
  portraitState: "running",
  portraitUrl: null,
};

export const chapterFixture: ChapterDto = {
  id: "chapter-1",
  name: "The Riverbank",
  prompt: "Compose one borderless family-friendly riverbank scene with the established cast.",
  characterNames: ["Mole", "Ratty"],
  illustrationState: "succeeded",
  illustrationUrl: "/api/projects/project-1/chapters/chapter-1/illustration",
};

export function projectFixture(overrides: Partial<ProjectDetailDto> = {}): ProjectDetailDto {
  return {
    id: "project-1",
    volumeNumber: 2,
    title: "The Riverbank Edition",
    createdAt: "2026-08-08T09:20:00.000Z",
    updatedAt: "2026-08-14T01:01:00.000Z",
    status: "draft",
    sourceWordCount: 12,
    completedStepCount: 0,
    totalStepCount: 5,
    source: { mode: "paste", originalName: null, byteCount: 74, wordCount: 12 },
    style: null,
    steps: stepFixtures(),
    characters: [],
    chapters: [],
    ...overrides,
  };
}

export function projectSummaryFixture(overrides: Partial<ProjectSummaryDto> = {}): ProjectSummaryDto {
  const project = projectFixture();
  return {
    id: project.id,
    volumeNumber: project.volumeNumber,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    status: project.status,
    sourceWordCount: project.sourceWordCount,
    completedStepCount: project.completedStepCount,
    totalStepCount: project.totalStepCount,
    ...overrides,
  };
}
