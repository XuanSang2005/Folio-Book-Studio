export const pipelineAttemptsMigration = {
  version: 2,
  sql: `
    ALTER TABLE pipeline_steps ADD COLUMN active_attempt_id TEXT;
    ALTER TABLE pipeline_steps ADD COLUMN heartbeat_at INTEGER;
    ALTER TABLE pipeline_steps ADD COLUMN lease_expires_at INTEGER;

    CREATE TABLE step_attempts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      step_ordinal INTEGER NOT NULL,
      attempt_no INTEGER NOT NULL CHECK(attempt_no > 0),
      status TEXT NOT NULL CHECK(status IN ('running', 'succeeded', 'failed', 'abandoned')),
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      error_code TEXT,
      error_message TEXT,
      UNIQUE(project_id, step_ordinal, attempt_no),
      FOREIGN KEY(project_id, step_ordinal)
        REFERENCES pipeline_steps(project_id, ordinal)
        ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX step_attempts_project_step_idx
      ON step_attempts(project_id, step_ordinal, attempt_no);
    CREATE INDEX pipeline_steps_running_lease_idx
      ON pipeline_steps(status, lease_expires_at);
  `,
} as const;
