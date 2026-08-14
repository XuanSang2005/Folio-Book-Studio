import { PIPELINE_STEPS, type ProjectStatus } from "@gradion-folio/contracts";

const STEP_COPY = {
  style: {
    eyebrow: "Art direction",
    running: "Reading the manuscript and establishing its visual grammar…",
  },
  characters: {
    eyebrow: "The cast",
    running: "Identifying the principal adult cast and writing portrait briefs…",
  },
  portraits: {
    eyebrow: "Portrait plates",
    running: "Rendering the character plates, one portrait at a time…",
  },
  chapters: {
    eyebrow: "Scene blueprint",
    label: "Chapter",
    running: "Composing one scene brief from the manuscript and established cast…",
  },
  illustrations: {
    eyebrow: "Final plate",
    label: "Illustration",
    running: "Rendering the final plate with portrait references for continuity…",
  },
} as const;

export const STEPS = PIPELINE_STEPS.map((step) => ({ ...step, ...STEP_COPY[step.key] }));

export type AppView = "library" | "new" | "studio";

export function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function projectStatusLabel(status: ProjectStatus) {
  if (status === "draft") return "Draft";
  if (status === "done") return "Done";
  return "In progress";
}
