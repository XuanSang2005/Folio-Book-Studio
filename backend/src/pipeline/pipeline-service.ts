import type {
  ApiErrorCode,
  PipelineStepOrdinal,
  ProjectDetailDto,
  RunProjectStepRequest,
  StepActionDisposition,
} from "@gradion-folio/contracts";
import { ApiError, projectNotFound } from "../http/api-errors.js";
import { getProject } from "../projects/project-service.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";
import {
  StepExecutionError,
  type IllustrationCheckpoint,
  type PortraitCheckpoint,
  type PortraitWorkItem,
} from "./step-executor.js";

type PipelineStepRow = {
  ordinal: PipelineStepOrdinal;
  status: "pending" | "running" | "succeeded" | "failed";
  active_attempt_id: string | null;
  lease_expires_at: number | null;
};

type ClaimedAttempt = {
  kind: "claimed";
  attemptId: string;
  attemptNumber: number;
};

type ClaimResult =
  | ClaimedAttempt
  | { kind: "already_succeeded" }
  | { kind: "running" };

export type StepActionResult = {
  disposition: StepActionDisposition;
  project: ProjectDetailDto;
  statusCode: 200 | 202;
};

function safeExecutionFailure(error: unknown): StepExecutionError {
  if (error instanceof StepExecutionError) return error;
  return new StepExecutionError(
    "PROVIDER_UNAVAILABLE",
    "Step execution failed.",
    503,
  );
}

export function claimStep(
  dependencies: ApplicationDependencies,
  userId: string,
  projectId: string,
  ordinal: PipelineStepOrdinal,
): ClaimResult {
  const claim = dependencies.database.transaction((): ClaimResult => {
    const project = dependencies.database.prepare(`
      SELECT id FROM projects WHERE id = ? AND user_id = ?
    `).get(projectId, userId);
    if (!project) throw projectNotFound();

    const requested = dependencies.database.prepare(`
      SELECT ordinal, status, active_attempt_id, lease_expires_at
      FROM pipeline_steps
      WHERE project_id = ? AND ordinal = ?
    `).get(projectId, ordinal) as PipelineStepRow | undefined;
    if (!requested) throw projectNotFound();

    if (requested.status === "succeeded") return { kind: "already_succeeded" };

    const current = dependencies.database.prepare(`
      SELECT ordinal
      FROM pipeline_steps
      WHERE project_id = ? AND status != 'succeeded'
      ORDER BY ordinal
      LIMIT 1
    `).get(projectId) as { ordinal: PipelineStepOrdinal } | undefined;

    if (!current || current.ordinal !== ordinal) {
      throw new ApiError(
        409,
        "STEP_OUT_OF_ORDER",
        "Only the first incomplete pipeline step can run.",
      );
    }

    const now = dependencies.clock.now().getTime();
    if (requested.status === "running") {
      if (requested.lease_expires_at !== null && requested.lease_expires_at > now) {
        return { kind: "running" };
      }
      throw new ApiError(
        409,
        "STEP_STUCK",
        "This running step has expired and requires explicit recovery.",
      );
    }

    const attempt = dependencies.database.prepare(`
      SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attempt_no
      FROM step_attempts
      WHERE project_id = ? AND step_ordinal = ?
    `).get(projectId, ordinal) as { attempt_no: number };
    const attemptId = dependencies.attemptIds.generate();
    const leaseExpiresAt = now + dependencies.config.STEP_LEASE_MS;

    dependencies.database.prepare(`
      INSERT INTO step_attempts (
        id, project_id, step_ordinal, attempt_no, status, started_at
      ) VALUES (?, ?, ?, ?, 'running', ?)
    `).run(attemptId, projectId, ordinal, attempt.attempt_no, now);
    dependencies.database.prepare(`
      UPDATE pipeline_steps
      SET status = 'running',
          attempt_count = attempt_count + 1,
          active_attempt_id = ?,
          started_at = ?,
          heartbeat_at = ?,
          lease_expires_at = ?,
          completed_at = NULL,
          error_code = NULL,
          error_message = NULL,
          updated_at = ?
      WHERE project_id = ? AND ordinal = ?
    `).run(
      attemptId,
      now,
      now,
      leaseExpiresAt,
      now,
      projectId,
      ordinal,
    );
    dependencies.database.prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(now, projectId);

    return {
      kind: "claimed",
      attemptId,
      attemptNumber: attempt.attempt_no,
    };
  });
  return claim.immediate();
}

export function heartbeatAttempt(
  dependencies: ApplicationDependencies,
  projectId: string,
  ordinal: PipelineStepOrdinal,
  attemptId: string,
): boolean {
  const now = dependencies.clock.now().getTime();
  const result = dependencies.database.prepare(`
    UPDATE pipeline_steps
    SET heartbeat_at = ?, lease_expires_at = ?, updated_at = ?
    WHERE project_id = ?
      AND ordinal = ?
      AND status = 'running'
      AND active_attempt_id = ?
  `).run(
    now,
    now + dependencies.config.STEP_LEASE_MS,
    now,
    projectId,
    ordinal,
    attemptId,
  );
  return result.changes === 1;
}

export function checkpointStepResult(
  dependencies: ApplicationDependencies,
  projectId: string,
  ordinal: PipelineStepOrdinal,
  attemptId: string,
  result: Record<string, unknown>,
): boolean {
  const updated = dependencies.database.prepare(`
    UPDATE pipeline_steps
    SET result_json = ?, updated_at = ?
    WHERE project_id = ?
      AND ordinal = ?
      AND status = 'running'
      AND active_attempt_id = ?
  `).run(
    JSON.stringify(result),
    dependencies.clock.now().getTime(),
    projectId,
    ordinal,
    attemptId,
  );
  return updated.changes === 1;
}

export function checkpointPortrait(
  dependencies: ApplicationDependencies,
  projectId: string,
  attemptId: string,
  checkpoint: PortraitCheckpoint,
): boolean {
  const now = dependencies.clock.now().getTime();
  const sharedWhere = `
    WHERE id = @characterId
      AND project_id = @projectId
      AND portrait_status != 'succeeded'
      AND EXISTS (
        SELECT 1 FROM pipeline_steps
        WHERE project_id = @projectId
          AND ordinal = 3
          AND status = 'running'
          AND active_attempt_id = @attemptId
      )
  `;
  const parameters = {
    characterId: checkpoint.characterId,
    projectId,
    attemptId,
    now,
  };

  if (checkpoint.status === "running") {
    const updated = dependencies.database.prepare(`
      UPDATE characters
      SET portrait_status = 'running',
          portrait_error_code = NULL,
          portrait_error_message = NULL,
          updated_at = @now
      ${sharedWhere}
    `).run(parameters);
    return updated.changes === 1;
  }

  if (checkpoint.status === "failed") {
    const updated = dependencies.database.prepare(`
      UPDATE characters
      SET portrait_status = 'failed',
          portrait_error_code = @errorCode,
          portrait_error_message = @errorMessage,
          updated_at = @now
      ${sharedWhere}
    `).run({
      ...parameters,
      errorCode: checkpoint.errorCode ?? "PROVIDER_UNAVAILABLE",
      errorMessage: checkpoint.errorMessage ?? "Portrait execution failed.",
    });
    return updated.changes === 1;
  }

  const updated = dependencies.database.prepare(`
    UPDATE characters
    SET portrait_status = 'succeeded',
        portrait_path = @portraitPath,
        portrait_mime = @portraitMime,
        portrait_bytes = @portraitBytes,
        portrait_sha256 = @portraitSha256,
        portrait_interaction_id = @portraitInteractionId,
        portrait_error_code = NULL,
        portrait_error_message = NULL,
        updated_at = @now
    ${sharedWhere}
  `).run({
    ...parameters,
    portraitPath: checkpoint.portraitPath ?? null,
    portraitMime: checkpoint.portraitMime ?? null,
    portraitBytes: checkpoint.portraitBytes ?? null,
    portraitSha256: checkpoint.portraitSha256 ?? null,
    portraitInteractionId: checkpoint.portraitInteractionId ?? null,
  });
  return updated.changes === 1;
}

export function checkpointIllustration(
  dependencies: ApplicationDependencies,
  projectId: string,
  attemptId: string,
  checkpoint: IllustrationCheckpoint,
): boolean {
  const now = dependencies.clock.now().getTime();
  const sharedWhere = `
    WHERE id = @chapterId
      AND project_id = @projectId
      AND illustration_status != 'succeeded'
      AND EXISTS (
        SELECT 1 FROM pipeline_steps
        WHERE project_id = @projectId
          AND ordinal = 5
          AND status = 'running'
          AND active_attempt_id = @attemptId
      )
  `;
  const parameters = {
    chapterId: checkpoint.chapterId,
    projectId,
    attemptId,
    now,
  };

  if (checkpoint.status === "running") {
    const updated = dependencies.database.prepare(`
      UPDATE chapters
      SET illustration_status = 'running',
          illustration_error_code = NULL,
          illustration_error_message = NULL,
          updated_at = @now
      ${sharedWhere}
    `).run(parameters);
    return updated.changes === 1;
  }
  if (checkpoint.status === "failed") {
    const updated = dependencies.database.prepare(`
      UPDATE chapters
      SET illustration_status = 'failed',
          illustration_error_code = @errorCode,
          illustration_error_message = @errorMessage,
          updated_at = @now
      ${sharedWhere}
    `).run({
      ...parameters,
      errorCode: checkpoint.errorCode ?? "PROVIDER_UNAVAILABLE",
      errorMessage: checkpoint.errorMessage ?? "Illustration execution failed.",
    });
    return updated.changes === 1;
  }
  const updated = dependencies.database.prepare(`
    UPDATE chapters
    SET illustration_status = 'succeeded',
        illustration_path = @illustrationPath,
        illustration_mime = @illustrationMime,
        illustration_bytes = @illustrationBytes,
        illustration_sha256 = @illustrationSha256,
        illustration_interaction_id = @illustrationInteractionId,
        illustration_error_code = NULL,
        illustration_error_message = NULL,
        updated_at = @now
    ${sharedWhere}
  `).run({
    ...parameters,
    illustrationPath: checkpoint.illustrationPath ?? null,
    illustrationMime: checkpoint.illustrationMime ?? null,
    illustrationBytes: checkpoint.illustrationBytes ?? null,
    illustrationSha256: checkpoint.illustrationSha256 ?? null,
    illustrationInteractionId: checkpoint.illustrationInteractionId ?? null,
  });
  return updated.changes === 1;
}

function portraitWork(
  dependencies: ApplicationDependencies,
  projectId: string,
): { all: number; missing: PortraitWorkItem[] } {
  const rows = dependencies.database.prepare(`
    SELECT id, name, portrait_status
    FROM characters
    WHERE project_id = ?
    ORDER BY position
  `).all(projectId) as Array<{
    id: string;
    name: string;
    portrait_status: "pending" | "running" | "succeeded" | "failed";
  }>;
  return {
    all: rows.length,
    missing: rows
      .filter(({ portrait_status: status }) => status !== "succeeded")
      .map(({ id, name }) => ({ characterId: id, characterName: name })),
  };
}

function finishAttempt(
  dependencies: ApplicationDependencies,
  projectId: string,
  ordinal: PipelineStepOrdinal,
  attemptId: string,
  outcome: "succeeded" | "failed",
  error?: { code: ApiErrorCode; message: string },
): boolean {
  return dependencies.database.transaction(() => {
    const now = dependencies.clock.now().getTime();
    const step = dependencies.database.prepare(`
      UPDATE pipeline_steps
      SET status = ?,
          active_attempt_id = NULL,
          heartbeat_at = NULL,
          lease_expires_at = NULL,
          completed_at = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?
      WHERE project_id = ?
        AND ordinal = ?
        AND status = 'running'
        AND active_attempt_id = ?
    `).run(
      outcome,
      now,
      error?.code ?? null,
      error?.message ?? null,
      now,
      projectId,
      ordinal,
      attemptId,
    );
    if (step.changes !== 1) return false;

    const attempt = dependencies.database.prepare(`
      UPDATE step_attempts
      SET status = ?, finished_at = ?, error_code = ?, error_message = ?
      WHERE id = ?
        AND project_id = ?
        AND step_ordinal = ?
        AND status = 'running'
    `).run(
      outcome,
      now,
      error?.code ?? null,
      error?.message ?? null,
      attemptId,
      projectId,
      ordinal,
    );
    if (attempt.changes !== 1) throw new Error("Active pipeline attempt is missing");
    dependencies.database.prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(now, projectId);
    return true;
  }).immediate();
}

export function succeedAttempt(
  dependencies: ApplicationDependencies,
  projectId: string,
  ordinal: PipelineStepOrdinal,
  attemptId: string,
): boolean {
  return finishAttempt(dependencies, projectId, ordinal, attemptId, "succeeded");
}

export function failAttempt(
  dependencies: ApplicationDependencies,
  projectId: string,
  ordinal: PipelineStepOrdinal,
  attemptId: string,
  error: { code: ApiErrorCode; message: string },
): boolean {
  return finishAttempt(dependencies, projectId, ordinal, attemptId, "failed", error);
}

export async function runProjectStep(
  dependencies: ApplicationDependencies,
  userId: string,
  projectId: string,
  ordinal: PipelineStepOrdinal,
  input: RunProjectStepRequest,
): Promise<StepActionResult> {
  if (ordinal !== 1 && input.artDirection !== undefined) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Art direction is accepted only for the Style step.",
      { artDirection: ["Art direction is accepted only for Stage I."] },
    );
  }

  const claim = claimStep(dependencies, userId, projectId, ordinal);
  if (claim.kind === "already_succeeded") {
    return {
      disposition: "already_succeeded",
      project: getProject(dependencies, userId, projectId),
      statusCode: 200,
    };
  }
  if (claim.kind === "running") {
    return {
      disposition: "running",
      project: getProject(dependencies, userId, projectId),
      statusCode: 202,
    };
  }

  const heartbeat = dependencies.heartbeatScheduler.every(
    dependencies.config.HEARTBEAT_MS,
    () => {
      try {
        heartbeatAttempt(dependencies, projectId, ordinal, claim.attemptId);
      } catch {
        // A terminal write or shutdown may race this process-local tick.
      }
    },
  );

  try {
    const portraits = ordinal === 3
      ? portraitWork(dependencies, projectId)
      : { all: 0, missing: [] };
    let executionResult: { result?: Record<string, unknown> } = {};

    if (ordinal === 3 && portraits.all > 0 && portraits.missing.length === 0) {
      await dependencies.stepExecutor.validateCompletedPortraits?.(projectId);
    } else {
      executionResult = await dependencies.stepExecutor.execute({
        projectId,
        ordinal,
        attemptId: claim.attemptId,
        attemptNumber: claim.attemptNumber,
        ...(input.artDirection ? { artDirection: input.artDirection } : {}),
        portraits: portraits.missing,
        checkpointResult: (result) => checkpointStepResult(
          dependencies,
          projectId,
          ordinal,
          claim.attemptId,
          result,
        ),
        checkpointPortrait: (checkpoint) => checkpointPortrait(
          dependencies,
          projectId,
          claim.attemptId,
          checkpoint,
        ),
        checkpointIllustration: (checkpoint) => checkpointIllustration(
          dependencies,
          projectId,
          claim.attemptId,
          checkpoint,
        ),
      });
    }

    if (executionResult.result) {
      checkpointStepResult(
        dependencies,
        projectId,
        ordinal,
        claim.attemptId,
        executionResult.result,
      );
    }
    if (ordinal === 3) {
      const remaining = portraitWork(dependencies, projectId);
      if (remaining.all > 0 && remaining.missing.length > 0) {
        throw new StepExecutionError(
          "INVALID_MODEL_OUTPUT",
          "Portrait execution did not complete every required character.",
          502,
        );
      }
    }

    const published = succeedAttempt(
      dependencies,
      projectId,
      ordinal,
      claim.attemptId,
    );
    return {
      disposition: published ? "succeeded" : "stale",
      project: getProject(dependencies, userId, projectId),
      statusCode: 200,
    };
  } catch (error) {
    const failure = safeExecutionFailure(error);
    const published = failAttempt(
      dependencies,
      projectId,
      ordinal,
      claim.attemptId,
      { code: failure.code, message: failure.message },
    );
    if (!published) {
      return {
        disposition: "stale",
        project: getProject(dependencies, userId, projectId),
        statusCode: 200,
      };
    }
    throw new ApiError(failure.httpStatus, failure.code, failure.message);
  } finally {
    heartbeat.cancel();
  }
}

export function recoverProjectStep(
  dependencies: ApplicationDependencies,
  userId: string,
  projectId: string,
  ordinal: PipelineStepOrdinal,
): StepActionResult {
  dependencies.database.transaction(() => {
    const project = dependencies.database.prepare(`
      SELECT id FROM projects WHERE id = ? AND user_id = ?
    `).get(projectId, userId);
    if (!project) throw projectNotFound();

    const step = dependencies.database.prepare(`
      SELECT status, active_attempt_id, lease_expires_at
      FROM pipeline_steps
      WHERE project_id = ? AND ordinal = ?
    `).get(projectId, ordinal) as {
      status: "pending" | "running" | "succeeded" | "failed";
      active_attempt_id: string | null;
      lease_expires_at: number | null;
    } | undefined;
    if (!step) throw projectNotFound();
    if (step.status !== "running" || !step.active_attempt_id) {
      throw new ApiError(
        409,
        "STEP_NOT_RECOVERABLE",
        "Only an expired running step can be recovered.",
      );
    }

    const now = dependencies.clock.now().getTime();
    if (step.lease_expires_at !== null && step.lease_expires_at > now) {
      throw new ApiError(
        409,
        "STEP_ALREADY_RUNNING",
        "This step still has a live lease and cannot be recovered.",
      );
    }

    const attempt = dependencies.database.prepare(`
      UPDATE step_attempts
      SET status = 'abandoned',
          finished_at = ?,
          error_code = 'PROCESS_INTERRUPTED',
          error_message = 'The prior process stopped before completing this step.'
      WHERE id = ?
        AND project_id = ?
        AND step_ordinal = ?
        AND status = 'running'
    `).run(now, step.active_attempt_id, projectId, ordinal);
    if (attempt.changes !== 1) {
      throw new ApiError(
        409,
        "STEP_NOT_RECOVERABLE",
        "The running attempt is no longer recoverable.",
      );
    }

    dependencies.database.prepare(`
      UPDATE provider_operations
      SET status = 'abandoned',
          finished_at = ?,
          duration_ms = ? - started_at,
          error_code = 'PROCESS_INTERRUPTED',
          error_message = 'The prior process stopped before completing this provider operation.'
      WHERE project_id = ?
        AND step_ordinal = ?
        AND attempt_id = ?
        AND status = 'running'
    `).run(now, now, projectId, ordinal, step.active_attempt_id);

    const recoveredStep = dependencies.database.prepare(`
      UPDATE pipeline_steps
      SET status = 'failed',
          active_attempt_id = NULL,
          heartbeat_at = NULL,
          lease_expires_at = NULL,
          completed_at = ?,
          error_code = 'PROCESS_INTERRUPTED',
          error_message = 'The prior process stopped before completing this step.',
          updated_at = ?
      WHERE project_id = ?
        AND ordinal = ?
        AND status = 'running'
        AND active_attempt_id = ?
    `).run(now, now, projectId, ordinal, step.active_attempt_id);
    if (recoveredStep.changes !== 1) {
      throw new ApiError(
        409,
        "STEP_NOT_RECOVERABLE",
        "The running attempt is no longer recoverable.",
      );
    }

    if (ordinal === 3) {
      dependencies.database.prepare(`
        UPDATE characters
        SET portrait_status = 'pending',
            portrait_path = NULL,
            portrait_mime = NULL,
            portrait_bytes = NULL,
            portrait_sha256 = NULL,
            portrait_interaction_id = NULL,
            portrait_error_code = NULL,
            portrait_error_message = NULL,
            updated_at = ?
        WHERE project_id = ? AND portrait_status = 'running'
      `).run(now, projectId);
    }
    if (ordinal === 5) {
      dependencies.database.prepare(`
        UPDATE chapters
        SET illustration_status = 'pending',
            illustration_path = NULL,
            illustration_mime = NULL,
            illustration_bytes = NULL,
            illustration_sha256 = NULL,
            illustration_interaction_id = NULL,
            illustration_error_code = NULL,
            illustration_error_message = NULL,
            updated_at = ?
        WHERE project_id = ? AND illustration_status = 'running'
      `).run(now, projectId);
    }
    dependencies.database.prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(now, projectId);
  }).immediate();

  return {
    disposition: "recovered",
    project: getProject(dependencies, userId, projectId),
    statusCode: 200,
  };
}
