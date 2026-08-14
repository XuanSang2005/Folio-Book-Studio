export const providerOperationsMigration = {
  version: 3,
  sql: `
    ALTER TABLE projects ADD COLUMN portrait_context_interaction_id TEXT;

    CREATE UNIQUE INDEX step_attempts_identity_idx
      ON step_attempts(id, project_id, step_ordinal);

    CREATE TABLE provider_operations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      step_ordinal INTEGER NOT NULL,
      attempt_id TEXT NOT NULL,
      operation_key TEXT NOT NULL CHECK(length(operation_key) BETWEEN 1 AND 200),
      item_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('running', 'succeeded', 'failed', 'abandoned')),
      model_id TEXT,
      prompt_version TEXT NOT NULL CHECK(length(prompt_version) BETWEEN 1 AND 100),
      input_context_key TEXT,
      provider_request_id TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      duration_ms INTEGER CHECK(duration_ms IS NULL OR duration_ms >= 0),
      usage_json TEXT,
      error_code TEXT,
      error_message TEXT,
      UNIQUE(attempt_id, operation_key),
      FOREIGN KEY(attempt_id, project_id, step_ordinal)
        REFERENCES step_attempts(id, project_id, step_ordinal)
        ON DELETE CASCADE,
      FOREIGN KEY(project_id, step_ordinal)
        REFERENCES pipeline_steps(project_id, ordinal)
        ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX provider_operations_project_step_idx
      ON provider_operations(project_id, step_ordinal, started_at);
    CREATE INDEX provider_operations_attempt_idx
      ON provider_operations(attempt_id, status);
  `,
} as const;
