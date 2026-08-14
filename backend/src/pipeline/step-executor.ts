import type {
  ApiErrorCode,
  PipelineStepOrdinal,
} from "@gradion-folio/contracts";

export type PortraitWorkItem = {
  characterId: string;
  characterName: string;
};

export type PortraitCheckpoint = {
  characterId: string;
  status: "running" | "succeeded" | "failed";
  portraitPath?: string | null;
  portraitMime?: string | null;
  portraitBytes?: number | null;
  portraitSha256?: string | null;
  portraitInteractionId?: string | null;
  errorCode?: ApiErrorCode | null;
  errorMessage?: string | null;
};

export type IllustrationCheckpoint = {
  chapterId: string;
  status: "running" | "succeeded" | "failed";
  illustrationPath?: string | null;
  illustrationMime?: string | null;
  illustrationBytes?: number | null;
  illustrationSha256?: string | null;
  illustrationInteractionId?: string | null;
  errorCode?: ApiErrorCode | null;
  errorMessage?: string | null;
};

export type StepExecutionContext = {
  projectId: string;
  ordinal: PipelineStepOrdinal;
  attemptId: string;
  attemptNumber: number;
  artDirection?: string;
  portraits: readonly PortraitWorkItem[];
  checkpointResult(result: Record<string, unknown>): boolean;
  checkpointPortrait(checkpoint: PortraitCheckpoint): boolean;
  checkpointIllustration(checkpoint: IllustrationCheckpoint): boolean;
};

export type StepExecutionResult = {
  result?: Record<string, unknown>;
};

export interface StepExecutor {
  validateCompletedPortraits?(projectId: string): Promise<void>;
  execute(context: StepExecutionContext): Promise<StepExecutionResult>;
}

export class StepExecutionError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly httpStatus = 503,
  ) {
    super(message);
    this.name = "StepExecutionError";
  }
}

export class UnconfiguredStepExecutor implements StepExecutor {
  async execute(): Promise<never> {
    throw new StepExecutionError(
      "GEMINI_NOT_CONFIGURED",
      "Pipeline execution is not configured for this runtime.",
      503,
    );
  }
}
