export const initialMigration = {
  version: 1,
  sql: `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email_normalized TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email_display TEXT NOT NULL CHECK(length(email_display) BETWEEN 3 AND 320),
      name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY CHECK(length(token_hash) = 64),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL CHECK(expires_at > created_at)
    ) STRICT;

    CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_number INTEGER NOT NULL CHECK(project_number > 0),
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
      source_mode TEXT NOT NULL CHECK(source_mode IN ('upload', 'paste')),
      source_path TEXT NOT NULL CHECK(length(source_path) > 0),
      source_original_name TEXT CHECK(source_original_name IS NULL OR length(source_original_name) BETWEEN 1 AND 255),
      source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
      source_bytes INTEGER NOT NULL CHECK(source_bytes > 0),
      source_words INTEGER NOT NULL CHECK(source_words > 0),
      gemini_file_name TEXT,
      gemini_file_uri TEXT,
      gemini_file_expires_at INTEGER,
      book_interaction_id TEXT,
      style_text TEXT,
      style_source TEXT CHECK(style_source IS NULL OR style_source IN ('user', 'generated')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, project_number)
    ) STRICT;

    CREATE INDEX projects_user_created_at_idx ON projects(user_id, created_at DESC);

    CREATE TABLE pipeline_steps (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'succeeded', 'failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
      started_at INTEGER,
      completed_at INTEGER,
      interaction_id TEXT,
      result_json TEXT,
      error_code TEXT,
      error_message TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, ordinal),
      CHECK(
        (ordinal = 1 AND key = 'style') OR
        (ordinal = 2 AND key = 'characters') OR
        (ordinal = 3 AND key = 'portraits') OR
        (ordinal = 4 AND key = 'chapters') OR
        (ordinal = 5 AND key = 'illustrations')
      )
    ) STRICT;

    CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK(position IN (0, 1)),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      age_group TEXT NOT NULL CHECK(age_group = 'adult'),
      prompt TEXT NOT NULL,
      portrait_status TEXT NOT NULL DEFAULT 'pending' CHECK(portrait_status IN ('pending', 'running', 'succeeded', 'failed')),
      portrait_path TEXT,
      portrait_mime TEXT,
      portrait_bytes INTEGER,
      portrait_sha256 TEXT,
      portrait_interaction_id TEXT,
      portrait_error_code TEXT,
      portrait_error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, position)
    ) STRICT;

    CREATE INDEX characters_project_position_idx ON characters(project_id, position);

    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK(position = 0),
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      character_names_json TEXT NOT NULL,
      illustration_status TEXT NOT NULL DEFAULT 'pending' CHECK(illustration_status IN ('pending', 'running', 'succeeded', 'failed')),
      illustration_path TEXT,
      illustration_mime TEXT,
      illustration_bytes INTEGER,
      illustration_sha256 TEXT,
      illustration_interaction_id TEXT,
      illustration_error_code TEXT,
      illustration_error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, position)
    ) STRICT;

    CREATE INDEX chapters_project_position_idx ON chapters(project_id, position);
  `,
} as const;
