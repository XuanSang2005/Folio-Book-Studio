import type { Chapter, Character, Project } from "./types";

export const STORAGE_KEY = "gradion-folio-prototype-v2";

export const STEPS = [
  {
    roman: "I",
    eyebrow: "Art direction",
    label: "Style",
    running: "Reading the manuscript and establishing its visual grammar…",
  },
  {
    roman: "II",
    eyebrow: "The cast",
    label: "Characters",
    running: "Identifying the principal adult cast and writing portrait briefs…",
  },
  {
    roman: "III",
    eyebrow: "Portrait plates",
    label: "Portraits",
    running: "Rendering the character plates, one portrait at a time…",
  },
  {
    roman: "IV",
    eyebrow: "Scene blueprint",
    label: "Chapter",
    running: "Composing one scene brief from the manuscript and established cast…",
  },
  {
    roman: "V",
    eyebrow: "Final plate",
    label: "Illustration",
    running: "Rendering the final plate with portrait references for continuity…",
  },
] as const;

export const SAMPLE_TEXT = `The Mole had been working very hard all the morning, spring-cleaning his little home. First with brooms, then with dusters; then on ladders and steps and chairs, with a brush and a pail of whitewash; till he had dust in his throat and eyes, and splashes of whitewash all over his black fur, and an aching back and weary arms.

Spring was moving in the air above and in the earth below and around him, penetrating even his dark and lowly little house with its spirit of divine discontent and longing. It was small wonder, then, that he suddenly flung down his brush on the floor, said “Bother!” and “O blow!” and also “Hang spring-cleaning!” and bolted out of the house without even waiting to put on his coat.

Something up above was calling him imperiously, and he made for the steep little tunnel which answered in his case to the gravelled carriage-drive owned by animals whose residences are nearer to the sun and air. So he scraped and scratched and scrabbled and scrooged, and then he scrooged again and scrabbled and scratched and scraped, working busily with his little paws and muttering to himself, “Up we go! Up we go!” till at last, pop! his snout came out into the sunlight, and he found himself rolling in the warm grass of a great meadow.`;

export const SAMPLE_STYLE =
  "Arts & Crafts-era storybook watercolour, with soft ink contours, moss green and weathered ochre, gentle river light, and tactile paper grain.";

export const SAMPLE_CHARACTERS: Character[] = [
  {
    name: "Mole",
    role: "The curious homebody",
    prompt:
      "An adult anthropomorphic mole, modest and curious, with velvet-black fur, a cream waistcoat and soil-softened paws; alert dark eyes, a gentle rounded silhouette, and the tentative posture of someone seeing the river for the first time.",
  },
  {
    name: "Ratty",
    role: "The river guide",
    prompt:
      "An adult anthropomorphic water vole, assured and warm, wearing a russet tweed jacket and a river-weathered satchel; silver-brown whiskers, bright observant eyes, and the relaxed bearing of a seasoned boatman.",
  },
];

export const SAMPLE_CHAPTER: Chapter = {
  name: "The Riverbank",
  prompt:
    "Mole and Ratty meet beside a luminous spring river. Mole stands in astonishment at the water while Ratty steadies a small blue boat at the bank. Preserve their established portrait features, use the Arts & Crafts watercolour direction, and compose a single borderless scene with no text.",
};

export const SEED_PROJECTS: Project[] = [
  {
    id: "riverbank",
    ownerEmail: "sang@example.com",
    volume: "VOL. 02",
    title: "The Wind in the Willows — Riverbank Edition",
    createdAt: "2026-08-08T09:20:00.000Z",
    bookText: SAMPLE_TEXT,
    completedSteps: 4,
    stepState: "idle",
    style: SAMPLE_STYLE,
    characters: SAMPLE_CHARACTERS,
    chapter: SAMPLE_CHAPTER,
    portraitProgress: 2,
  },
  {
    id: "frankenstein",
    ownerEmail: "sang@example.com",
    volume: "VOL. 01",
    title: "Frankenstein — The First Awakening",
    createdAt: "2026-08-06T15:40:00.000Z",
    bookText: "It was on a dreary night of November that I beheld the accomplishment of my toils…",
    completedSteps: 5,
    stepState: "idle",
    style:
      "Romantic-era ink wash and engraved shadow, lit by cold laboratory moonlight and restrained copper highlights.",
    characters: [
      {
        name: "Victor Frankenstein",
        role: "The ambitious natural philosopher",
        prompt:
          "An exhausted adult scholar in a dark 1810s waistcoat, hollow-eyed after months of obsessive work, surrounded by anatomical notes and copper instruments.",
      },
      {
        name: "The Creature",
        role: "The abandoned creation",
        prompt:
          "A towering adult figure with grave, searching eyes and carefully stitched features, rendered with dignity rather than horror, wrapped in a weathered dark coat.",
      },
    ],
    chapter: {
      name: "The First Awakening",
      prompt:
        "A cold laboratory at midnight as Victor recoils from the first movement of his creation, with lightning reflected in rain-streaked windows.",
    },
    portraitProgress: 2,
  },
  {
    id: "dorian",
    ownerEmail: "sang@example.com",
    volume: "VOL. 03",
    title: "The Picture of Dorian Gray",
    createdAt: "2026-08-09T11:12:00.000Z",
    bookText:
      "The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden…",
    completedSteps: 0,
    stepState: "idle",
    characters: [],
    portraitProgress: 0,
  },
];

export function projectStatus(project: Project) {
  if (project.completedSteps === 0) return "Draft";
  if (project.completedSteps === STEPS.length) return "Done";
  return "In progress";
}

export function projectPlateSrc(project: Project) {
  const identity = `${project.id} ${project.title}`.toLowerCase();
  if (identity.includes("frankenstein")) return "/illustrations/frankenstein.webp";
  if (identity.includes("dorian")) return "/illustrations/dorian-gray.webp";
  if (identity.includes("riverbank") || identity.includes("willows")) {
    return "/illustrations/riverbank.webp";
  }
  return "/illustrations/folio-triptych.webp";
}

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
