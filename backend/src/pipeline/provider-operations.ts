import type { ApiErrorCode, PipelineStepOrdinal } from "@gradion-folio/contracts";
import type { ProviderMetadata } from "../integrations/gemini/gateway.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";

export type ActiveAttempt = {
  projectId: string;
  ordinal: PipelineStepOrdinal;
  attemptId: string;
};

export type OperationDescriptor = {
  operationKey: string;
  itemId?: string;
  modelId?: string;
  promptVersion: string;
  inputContextKey?: string;
};

export class AttemptOwnershipLostError extends Error {
  constructor() {
    super("Pipeline attempt ownership was lost.");
    this.name = "AttemptOwnershipLostError";
  }
}

function ownsAttempt(
  dependencies: ApplicationDependencies,
  attempt: ActiveAttempt,
): boolean {
  return Boolean(dependencies.database.prepare(`
    SELECT 1
    FROM pipeline_steps
    WHERE project_id = ?
      AND ordinal = ?
      AND status = 'running'
      AND active_attempt_id = ?
  `).get(attempt.projectId, attempt.ordinal, attempt.attemptId));
}

export function assertAttemptOwnership(
  dependencies: ApplicationDependencies,
  attempt: ActiveAttempt,
): void {
  if (!ownsAttempt(dependencies, attempt)) throw new AttemptOwnershipLostError();
}

export function beginProviderOperation(
  dependencies: ApplicationDependencies,
  attempt: ActiveAttempt,
  descriptor: OperationDescriptor,
): string {
  return dependencies.database.transaction(() => {
    assertAttemptOwnership(dependencies, attempt);
    const id = dependencies.ids.generate();
    dependencies.database.prepare(`
      INSERT INTO provider_operations (
        id, project_id, step_ordinal, attempt_id, operation_key, item_id,
        status, model_id, prompt_version, input_context_key, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)
    `).run(
      id,
      attempt.projectId,
      attempt.ordinal,
      attempt.attemptId,
      descriptor.operationKey,
      descriptor.itemId ?? null,
      descriptor.modelId ?? null,
      descriptor.promptVersion,
      descriptor.inputContextKey ?? null,
      dependencies.clock.now().getTime(),
    );
    return id;
  }).immediate();
}

function safeUsage(provider: ProviderMetadata): string | null {
  if (!provider.usage) return null;
  return JSON.stringify({
    ...(provider.usage.inputTokens === undefined ? {} : { inputTokens: provider.usage.inputTokens }),
    ...(provider.usage.outputTokens === undefined ? {} : { outputTokens: provider.usage.outputTokens }),
    ...(provider.usage.totalTokens === undefined ? {} : { totalTokens: provider.usage.totalTokens }),
  });
}

export function completeProviderOperation(
  dependencies: ApplicationDependencies,
  attempt: ActiveAttempt,
  operationId: string,
  provider: ProviderMetadata,
  checkpoint: () => void,
): void {
  dependencies.database.transaction(() => {
    assertAttemptOwnership(dependencies, attempt);
    const now = dependencies.clock.now().getTime();
    const updated = dependencies.database.prepare(`
      UPDATE provider_operations
      SET status = 'succeeded',
          model_id = ?,
          provider_request_id = ?,
          finished_at = ?,
          duration_ms = ? - started_at,
          usage_json = ?,
          error_code = NULL,
          error_message = NULL
      WHERE id = ?
        AND project_id = ?
        AND step_ordinal = ?
        AND attempt_id = ?
        AND status = 'running'
    `).run(
      provider.modelId,
      provider.requestId ?? null,
      now,
      now,
      safeUsage(provider),
      operationId,
      attempt.projectId,
      attempt.ordinal,
      attempt.attemptId,
    );
    if (updated.changes !== 1) throw new AttemptOwnershipLostError();
    checkpoint();
  }).immediate();
}

export function failProviderOperation(
  dependencies: ApplicationDependencies,
  attempt: ActiveAttempt,
  operationId: string,
  error: { code: ApiErrorCode; message: string },
): boolean {
  return dependencies.database.transaction(() => {
    if (!ownsAttempt(dependencies, attempt)) return false;
    const now = dependencies.clock.now().getTime();
    const updated = dependencies.database.prepare(`
      UPDATE provider_operations
      SET status = 'failed',
          finished_at = ?,
          duration_ms = ? - started_at,
          error_code = ?,
          error_message = ?
      WHERE id = ?
        AND project_id = ?
        AND step_ordinal = ?
        AND attempt_id = ?
        AND status = 'running'
    `).run(
      now,
      now,
      error.code,
      error.message,
      operationId,
      attempt.projectId,
      attempt.ordinal,
      attempt.attemptId,
    );
    return updated.changes === 1;
  }).immediate();
}

export function abandonRunningProviderOperations(
  dependencies: ApplicationDependencies,
  attempt: ActiveAttempt,
  now: number,
): void {
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
  `).run(now, now, attempt.projectId, attempt.ordinal, attempt.attemptId);
}
