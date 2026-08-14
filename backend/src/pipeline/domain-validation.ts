import { z } from "zod";
import type {
  GatewayChapter,
  GatewayCharacter,
  GatewayImage,
} from "../integrations/gemini/gateway.js";
import { StepExecutionError } from "./step-executor.js";

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

const CharacterSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  ageGroup: z.literal("adult"),
  prompt: z.string().trim().min(1),
}).strict().superRefine((character, context) => {
  if (wordCount(character.prompt) < 50) {
    context.addIssue({
      code: "custom",
      path: ["prompt"],
      message: "Portrait prompts must contain at least 50 words.",
    });
  }
});

const CharactersSchema = z.array(CharacterSchema).min(1).max(2).superRefine((characters, context) => {
  const names = new Set<string>();
  characters.forEach(({ name }, index) => {
    const normalized = name.toLocaleLowerCase("en");
    if (names.has(normalized)) {
      context.addIssue({ code: "custom", path: [index, "name"], message: "Character names must be unique." });
    }
    names.add(normalized);
  });
});

const ChapterSchema = z.object({
  name: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  characterNames: z.array(z.string().trim().min(1)).max(2),
}).strict().superRefine((chapter, context) => {
  if (wordCount(chapter.prompt) < 30) {
    context.addIssue({
      code: "custom",
      path: ["prompt"],
      message: "Chapter illustration prompts must contain at least 30 words.",
    });
  }
});

export function validatedCharacters(value: unknown): GatewayCharacter[] {
  const parsed = CharactersSchema.safeParse(value);
  if (!parsed.success) {
    throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Gemini returned invalid character data.", 502);
  }
  return parsed.data;
}

export function validatedChapter(
  value: unknown,
  castNames: readonly string[],
): GatewayChapter {
  const chapters = z.array(ChapterSchema).min(1).max(1).safeParse(value);
  if (!chapters.success) {
    throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Gemini returned invalid chapter data.", 502);
  }
  const allowed = new Set(castNames);
  if (chapters.data[0]!.characterNames.some((name) => !allowed.has(name))) {
    throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Gemini referenced an unknown chapter character.", 502);
  }
  return chapters.data[0]!;
}

export function validatedGatewayImage(value: unknown): GatewayImage {
  if (
    typeof value !== "object"
    || value === null
    || !("bytes" in value)
    || !((value as { bytes?: unknown }).bytes instanceof Uint8Array)
    || !("mimeType" in value)
    || !["image/png", "image/jpeg", "image/webp"].includes(String((value as { mimeType?: unknown }).mimeType))
  ) {
    throw new StepExecutionError("NO_IMAGE", "Gemini returned no usable image.", 502);
  }
  return value as GatewayImage;
}
