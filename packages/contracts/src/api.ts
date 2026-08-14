import { z } from "zod";
import { ApiErrorCodeSchema } from "./errors.js";
import {
  MAX_ADULT_CHARACTERS,
  MAX_CHAPTERS,
  PERSISTED_STEP_STATUSES,
  PIPELINE_STEPS,
  PIPELINE_STEP_KEYS,
  PIPELINE_STEP_ORDINALS,
  PROJECT_STATUSES,
  SOURCE_MODES,
  VISIBLE_STEP_STATES,
  type PipelineStepOrdinal,
} from "./pipeline.js";

const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const PROJECT_TITLE_MAX_LENGTH = 200;
export const SOURCE_FILENAME_MAX_LENGTH = 255;

export const PipelineStepKeySchema = z.enum(PIPELINE_STEP_KEYS);
export const PipelineStepOrdinalSchema = z.union(
  PIPELINE_STEP_ORDINALS.map((ordinal) => z.literal(ordinal)) as [
    z.ZodLiteral<PipelineStepOrdinal>,
    z.ZodLiteral<PipelineStepOrdinal>,
    ...z.ZodLiteral<PipelineStepOrdinal>[],
  ],
);
export const PersistedStepStatusSchema = z.enum(PERSISTED_STEP_STATUSES);
export const VisibleStepStateSchema = z.enum(VISIBLE_STEP_STATES);
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export const SourceModeSchema = z.enum(SOURCE_MODES);

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});

export const ReadinessResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  checks: z.object({
    database: z.enum(["ok", "error"]),
    migrations: z.enum(["ok", "error"]),
    dataDirectory: z.enum(["ok", "error"]),
  }),
  geminiConfigured: z.boolean(),
});

export const UserDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
});

export const SessionDtoSchema = z.object({
  user: UserDtoSchema,
  expiresAt: IsoDateTimeSchema,
});

export const CreateSessionRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
}).strict();

export const EndSessionResponseSchema = z.object({
  signedOut: z.literal(true),
});

export const CreatePasteProjectRequestSchema = z.object({
  title: z.string().trim().min(1).max(PROJECT_TITLE_MAX_LENGTH),
  sourceMode: z.literal("paste"),
  text: z.string().min(1),
}).strict();

export const CreateUploadProjectFieldsSchema = z.object({
  title: z.string().trim().min(1).max(PROJECT_TITLE_MAX_LENGTH),
  sourceMode: z.literal("upload"),
}).strict();

export const ProjectRouteParamsSchema = z.object({
  projectId: z.string().uuid(),
}).strict();

export const ProjectStepRouteParamsSchema = z.object({
  projectId: z.string().uuid(),
  ordinal: z.coerce.number().pipe(PipelineStepOrdinalSchema),
}).strict();

export const CharacterArtifactRouteParamsSchema = z.object({
  projectId: z.string().uuid(),
  characterId: z.string().uuid(),
}).strict();

export const ChapterArtifactRouteParamsSchema = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
}).strict();

export const RunProjectStepRequestSchema = z.object({
  artDirection: z.string().trim().min(1).max(4_000).optional(),
}).strict();

export const StepSummaryDtoSchema = z.object({
  ordinal: PipelineStepOrdinalSchema,
  key: PipelineStepKeySchema,
  status: PersistedStepStatusSchema,
  visibleState: VisibleStepStateSchema,
  attemptCount: z.number().int().nonnegative(),
  startedAt: IsoDateTimeSchema.nullable(),
  completedAt: IsoDateTimeSchema.nullable(),
  errorCode: ApiErrorCodeSchema.nullable(),
  errorMessage: z.string().min(1).nullable(),
});

export const CanonicalStepSummariesSchema = z.array(StepSummaryDtoSchema)
  .length(PIPELINE_STEPS.length)
  .superRefine((steps, context) => {
    PIPELINE_STEPS.forEach((expected, index) => {
      const actual = steps[index];
      if (!actual) return;

      if (actual.ordinal !== expected.ordinal) {
        context.addIssue({
          code: "custom",
          path: [index, "ordinal"],
          message: `Expected pipeline ordinal ${expected.ordinal}`,
        });
      }
      if (actual.key !== expected.key) {
        context.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `Expected pipeline key ${expected.key}`,
        });
      }
    });
  });

export const ProjectSummaryDtoSchema = z.object({
  id: z.string().min(1),
  volumeNumber: z.number().int().positive(),
  title: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  status: ProjectStatusSchema,
  sourceWordCount: z.number().int().nonnegative(),
  completedStepCount: z.number().int().min(0).max(PIPELINE_STEPS.length),
  totalStepCount: z.literal(PIPELINE_STEPS.length),
});

export const CharacterDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  ageGroup: z.literal("adult"),
  prompt: z.string().min(1),
  portraitState: VisibleStepStateSchema,
  portraitUrl: z.string().min(1).nullable(),
});

export const ChapterDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  characterNames: z.array(z.string().min(1)).max(MAX_ADULT_CHARACTERS),
  illustrationState: VisibleStepStateSchema,
  illustrationUrl: z.string().min(1).nullable(),
});

export const ProjectDetailDtoSchema = ProjectSummaryDtoSchema.extend({
  source: z.object({
    mode: SourceModeSchema,
    originalName: z.string().min(1).nullable(),
    byteCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
  }),
  style: z.string().min(1).nullable(),
  steps: CanonicalStepSummariesSchema,
  characters: z.array(CharacterDtoSchema).max(MAX_ADULT_CHARACTERS),
  chapters: z.array(ChapterDtoSchema).max(MAX_CHAPTERS),
});

export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSummaryDtoSchema),
});

export const ManuscriptResponseSchema = z.object({
  text: z.string(),
});

export const StepActionDispositionSchema = z.enum([
  "succeeded",
  "already_succeeded",
  "running",
  "recovered",
  "stale",
]);

export const StepActionResponseSchema = z.object({
  disposition: StepActionDispositionSchema,
  project: ProjectDetailDtoSchema,
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
export type UserDto = z.infer<typeof UserDtoSchema>;
export type SessionDto = z.infer<typeof SessionDtoSchema>;
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type EndSessionResponse = z.infer<typeof EndSessionResponseSchema>;
export type CreatePasteProjectRequest = z.infer<typeof CreatePasteProjectRequestSchema>;
export type CreateUploadProjectFields = z.infer<typeof CreateUploadProjectFieldsSchema>;
export type ProjectRouteParams = z.infer<typeof ProjectRouteParamsSchema>;
export type ProjectStepRouteParams = z.infer<typeof ProjectStepRouteParamsSchema>;
export type CharacterArtifactRouteParams = z.infer<typeof CharacterArtifactRouteParamsSchema>;
export type ChapterArtifactRouteParams = z.infer<typeof ChapterArtifactRouteParamsSchema>;
export type RunProjectStepRequest = z.infer<typeof RunProjectStepRequestSchema>;
export type StepSummaryDto = z.infer<typeof StepSummaryDtoSchema>;
export type ProjectSummaryDto = z.infer<typeof ProjectSummaryDtoSchema>;
export type CharacterDto = z.infer<typeof CharacterDtoSchema>;
export type ChapterDto = z.infer<typeof ChapterDtoSchema>;
export type ProjectDetailDto = z.infer<typeof ProjectDetailDtoSchema>;
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
export type ManuscriptResponse = z.infer<typeof ManuscriptResponseSchema>;
export type StepActionDisposition = z.infer<typeof StepActionDispositionSchema>;
export type StepActionResponse = z.infer<typeof StepActionResponseSchema>;
