export const PIPELINE_STEPS = [
  { ordinal: 1, key: "style", label: "Style", roman: "I" },
  { ordinal: 2, key: "characters", label: "Characters", roman: "II" },
  { ordinal: 3, key: "portraits", label: "Portraits", roman: "III" },
  { ordinal: 4, key: "chapters", label: "Chapters", roman: "IV" },
  { ordinal: 5, key: "illustrations", label: "Illustrations", roman: "V" },
] as const;

export const MAX_ADULT_CHARACTERS = 2;
export const MAX_CHAPTERS = 1;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];
export type PipelineStepKey = PipelineStep["key"];
export type PipelineStepOrdinal = PipelineStep["ordinal"];

export const PIPELINE_STEP_KEYS = PIPELINE_STEPS.map(
  ({ key }) => key,
) as unknown as readonly [PipelineStepKey, ...PipelineStepKey[]];

export const PIPELINE_STEP_ORDINALS = PIPELINE_STEPS.map(
  ({ ordinal }) => ordinal,
) as unknown as readonly [PipelineStepOrdinal, ...PipelineStepOrdinal[]];

export const PERSISTED_STEP_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
] as const;

export const VISIBLE_STEP_STATES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "stuck",
] as const;

export const PROJECT_STATUSES = ["draft", "in_progress", "done"] as const;
export const SOURCE_MODES = ["upload", "paste"] as const;

export type PersistedStepStatus = (typeof PERSISTED_STEP_STATUSES)[number];
export type VisibleStepState = (typeof VISIBLE_STEP_STATES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type SourceMode = (typeof SOURCE_MODES)[number];
