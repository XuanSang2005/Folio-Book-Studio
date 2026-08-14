import { describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/migrate.js";
import { createTestHarness } from "./helpers/harness.js";

describe("SQLite foundation", () => {
  it("enables required pragmas and applies migrations repeatably", async () => {
    const harness = await createTestHarness();
    try {
      expect(harness.database.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(harness.database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(harness.database.pragma("busy_timeout", { simple: true })).toBe(5_000);

      runMigrations(harness.database);
      runMigrations(harness.database);
      expect(harness.database.prepare("SELECT version FROM schema_migrations ORDER BY version").all())
        .toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
      expect(harness.database.prepare("PRAGMA table_info(pipeline_steps)").all())
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "active_attempt_id" }),
          expect.objectContaining({ name: "heartbeat_at" }),
          expect.objectContaining({ name: "lease_expires_at" }),
        ]));
      expect(harness.database.prepare("PRAGMA table_info(projects)").all())
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "portrait_context_interaction_id" }),
        ]));
      expect(harness.database.prepare("PRAGMA table_info(provider_operations)").all())
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "attempt_id" }),
          expect.objectContaining({ name: "operation_key" }),
          expect.objectContaining({ name: "prompt_version" }),
          expect.objectContaining({ name: "provider_request_id" }),
          expect.objectContaining({ name: "usage_json" }),
        ]));
    } finally {
      await harness.cleanup();
    }
  });

  it("enforces foreign keys, canonical stage mappings, and physical item caps", async () => {
    const harness = await createTestHarness();
    const now = harness.clock.now().getTime();
    const userId = "00000000-0000-4000-8000-000000000101";
    const projectId = "00000000-0000-4000-8000-000000000102";

    try {
      const insertProject = harness.database.prepare(`
        INSERT INTO projects (
          id, user_id, project_number, title, source_mode, source_path,
          source_sha256, source_bytes, source_words, created_at, updated_at
        ) VALUES (?, ?, 1, 'Volume', 'paste', 'users/u/projects/p/source/book.txt', ?, 4, 1, ?, ?)
      `);
      expect(() => insertProject.run(
        projectId,
        "00000000-0000-4000-8000-000000999999",
        "a".repeat(64),
        now,
        now,
      )).toThrow();

      harness.database.prepare(`
        INSERT INTO users (id, email_normalized, email_display, name, created_at, updated_at)
        VALUES (?, 'reader@example.com', 'reader@example.com', 'Reader', ?, ?)
      `).run(userId, now, now);
      insertProject.run(projectId, userId, "a".repeat(64), now, now);

      const insertStep = harness.database.prepare(`
        INSERT INTO pipeline_steps (project_id, ordinal, key, updated_at) VALUES (?, ?, ?, ?)
      `);
      expect(() => insertStep.run(projectId, 1, "characters", now)).toThrow();
      expect(() => insertStep.run(projectId, 6, "style", now)).toThrow();
      insertStep.run(projectId, 1, "style", now);

      const insertAttempt = harness.database.prepare(`
        INSERT INTO step_attempts (
          id, project_id, step_ordinal, attempt_no, status, started_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertAttempt.run("attempt-1", projectId, 1, 1, "running", now);
      expect(() => insertAttempt.run("attempt-duplicate", projectId, 1, 1, "running", now))
        .toThrow();
      expect(() => insertAttempt.run("attempt-zero", projectId, 1, 0, "running", now))
        .toThrow();
      expect(() => insertAttempt.run("attempt-status", projectId, 1, 2, "pending", now))
        .toThrow();
      expect(() => insertAttempt.run("attempt-orphan", projectId, 2, 1, "running", now))
        .toThrow();
      harness.database.prepare("DELETE FROM pipeline_steps WHERE project_id = ? AND ordinal = 1")
        .run(projectId);
      expect(harness.database.prepare("SELECT COUNT(*) AS count FROM step_attempts").get())
        .toEqual({ count: 0 });

      const insertCharacter = harness.database.prepare(`
        INSERT INTO characters (
          id, project_id, position, name, role, age_group, prompt, created_at, updated_at
        ) VALUES (?, ?, ?, 'Mole', 'Lead', ?, 'Prompt', ?, ?)
      `);
      insertCharacter.run("character-0", projectId, 0, "adult", now, now);
      insertCharacter.run("character-1", projectId, 1, "adult", now, now);
      expect(() => insertCharacter.run("character-2", projectId, 2, "adult", now, now)).toThrow();
      expect(() => insertCharacter.run("character-child", projectId, 1, "child", now, now)).toThrow();

      const insertChapter = harness.database.prepare(`
        INSERT INTO chapters (
          id, project_id, position, name, prompt, character_names_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'Riverbank', 'Prompt', '[]', ?, ?)
      `);
      insertChapter.run("chapter-0", projectId, 0, now, now);
      expect(() => insertChapter.run("chapter-1", projectId, 1, now, now)).toThrow();
    } finally {
      await harness.cleanup();
    }
  });
});
