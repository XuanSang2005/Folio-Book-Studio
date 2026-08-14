import type Database from "better-sqlite3";
import { initialMigration } from "./migrations/001-initial.js";
import { pipelineAttemptsMigration } from "./migrations/002-pipeline-attempts.js";
import { providerOperationsMigration } from "./migrations/003-provider-operations.js";

const migrations = [
  initialMigration,
  pipelineAttemptsMigration,
  providerOperationsMigration,
] as const;

export function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);

  const hasMigration = database.prepare(
    "SELECT 1 FROM schema_migrations WHERE version = ?",
  );
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    if (hasMigration.get(migration.version)) continue;

    database.transaction(() => {
      database.exec(migration.sql);
      recordMigration.run(migration.version, Date.now());
    }).immediate();
  }
}
