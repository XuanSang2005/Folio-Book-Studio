import {
  PIPELINE_STEPS,
  type ApiErrorCode,
  type ChapterDto,
  type CharacterDto,
  type PersistedStepStatus,
  type ProjectDetailDto,
  type ProjectStatus,
  type ProjectSummaryDto,
  type SourceMode,
  type StepSummaryDto,
} from "@gradion-folio/contracts";
import type { ApplicationDependencies } from "../runtime/dependencies.js";
import { projectNotFound } from "../http/api-errors.js";

type ProjectRow = {
  id: string;
  project_number: number;
  title: string;
  source_mode: SourceMode;
  source_path: string;
  source_original_name: string | null;
  source_bytes: number;
  source_words: number;
  style_text: string | null;
  created_at: number;
  updated_at: number;
};

type ProjectSummaryRow = ProjectRow & {
  completed_steps: number;
  attempted_steps: number;
};

type StepRow = {
  ordinal: 1 | 2 | 3 | 4 | 5;
  key: "style" | "characters" | "portraits" | "chapters" | "illustrations";
  status: PersistedStepStatus;
  attempt_count: number;
  started_at: number | null;
  completed_at: number | null;
  lease_expires_at: number | null;
  error_code: ApiErrorCode | null;
  error_message: string | null;
};

type CharacterRow = {
  id: string;
  name: string;
  role: string;
  age_group: "adult";
  prompt: string;
  portrait_status: PersistedStepStatus;
  portrait_path: string | null;
};

type ChapterRow = {
  id: string;
  name: string;
  prompt: string;
  character_names_json: string;
  illustration_status: PersistedStepStatus;
  illustration_path: string | null;
};

export type CreateProjectInput = {
  userId: string;
  title: string;
  sourceMode: SourceMode;
  originalName: string | null;
  bytes: Uint8Array;
};

function isoDate(timestamp: number | null): string | null {
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function derivedStatus(completedSteps: number, attemptedSteps: number): ProjectStatus {
  if (completedSteps === PIPELINE_STEPS.length) return "done";
  if (attemptedSteps === 0) return "draft";
  return "in_progress";
}

function summaryDto(row: ProjectSummaryRow): ProjectSummaryDto {
  return {
    id: row.id,
    volumeNumber: row.project_number,
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    status: derivedStatus(row.completed_steps, row.attempted_steps),
    sourceWordCount: row.source_words,
    completedStepCount: row.completed_steps,
    totalStepCount: PIPELINE_STEPS.length,
  };
}

function stepDto(row: StepRow, now: number): StepSummaryDto {
  return {
    ordinal: row.ordinal,
    key: row.key,
    status: row.status,
    visibleState: row.status === "running"
      && (row.lease_expires_at === null || row.lease_expires_at <= now)
      ? "stuck"
      : row.status,
    attemptCount: row.attempt_count,
    startedAt: isoDate(row.started_at),
    completedAt: isoDate(row.completed_at),
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

function characterDto(projectId: string, row: CharacterRow): CharacterDto {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    ageGroup: row.age_group,
    prompt: row.prompt,
    portraitState: row.portrait_status,
    portraitUrl: row.portrait_path
      ? `/api/projects/${projectId}/characters/${row.id}/portrait`
      : null,
  };
}

function chapterDto(projectId: string, row: ChapterRow): ChapterDto {
  const characterNames: unknown = JSON.parse(row.character_names_json);
  if (!Array.isArray(characterNames) || !characterNames.every((name) => typeof name === "string")) {
    throw new Error("Stored chapter character names are invalid");
  }
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    characterNames,
    illustrationState: row.illustration_status,
    illustrationUrl: row.illustration_path
      ? `/api/projects/${projectId}/chapters/${row.id}/illustration`
      : null,
  };
}

const projectWithStepCounts = `
  SELECT
    p.*,
    SUM(CASE WHEN s.status = 'succeeded' THEN 1 ELSE 0 END) AS completed_steps,
    SUM(s.attempt_count) AS attempted_steps
  FROM projects p
  JOIN pipeline_steps s ON s.project_id = p.id
`;

export function listProjects(
  dependencies: ApplicationDependencies,
  userId: string,
): ProjectSummaryDto[] {
  const rows = dependencies.database.prepare(`${projectWithStepCounts}
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC, p.project_number DESC
  `).all(userId) as ProjectSummaryRow[];

  return rows.map(summaryDto);
}

export function getProject(
  dependencies: ApplicationDependencies,
  userId: string,
  projectId: string,
): ProjectDetailDto {
  const project = dependencies.database.prepare(`${projectWithStepCounts}
    WHERE p.id = ? AND p.user_id = ?
    GROUP BY p.id
  `).get(projectId, userId) as ProjectSummaryRow | undefined;

  if (!project) throw projectNotFound();

  const steps = dependencies.database.prepare(`
    SELECT ordinal, key, status, attempt_count, started_at, completed_at,
           lease_expires_at, error_code, error_message
    FROM pipeline_steps
    WHERE project_id = ?
    ORDER BY ordinal
  `).all(projectId) as StepRow[];
  const characters = dependencies.database.prepare(`
    SELECT id, name, role, age_group, prompt, portrait_status, portrait_path
    FROM characters
    WHERE project_id = ?
    ORDER BY position
  `).all(projectId) as CharacterRow[];
  const chapters = dependencies.database.prepare(`
    SELECT id, name, prompt, character_names_json, illustration_status, illustration_path
    FROM chapters
    WHERE project_id = ?
    ORDER BY position
  `).all(projectId) as ChapterRow[];

  return {
    ...summaryDto(project),
    source: {
      mode: project.source_mode,
      originalName: project.source_original_name,
      byteCount: project.source_bytes,
      wordCount: project.source_words,
    },
    style: project.style_text,
    steps: steps.map((step) => stepDto(step, dependencies.clock.now().getTime())),
    characters: characters.map((row) => characterDto(projectId, row)),
    chapters: chapters.map((row) => chapterDto(projectId, row)),
  };
}

export async function createProject(
  dependencies: ApplicationDependencies,
  input: CreateProjectInput,
): Promise<ProjectDetailDto> {
  const source = dependencies.localFiles.canonicalize(input.bytes);
  const projectId = dependencies.ids.generate();
  const stored = await dependencies.localFiles.writeSource({
    userId: input.userId,
    projectId,
    source,
  });
  const now = dependencies.clock.now().getTime();

  try {
    dependencies.database.transaction(() => {
      const allocation = dependencies.database.prepare(`
        SELECT COALESCE(MAX(project_number), 0) + 1 AS project_number
        FROM projects
        WHERE user_id = ?
      `).get(input.userId) as { project_number: number };

      dependencies.database.prepare(`
        INSERT INTO projects (
          id, user_id, project_number, title, source_mode, source_path,
          source_original_name, source_sha256, source_bytes, source_words,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        input.userId,
        allocation.project_number,
        input.title,
        input.sourceMode,
        stored.relativePath,
        input.originalName,
        stored.sha256,
        stored.byteCount,
        stored.wordCount,
        now,
        now,
      );

      const insertStep = dependencies.database.prepare(`
        INSERT INTO pipeline_steps (project_id, ordinal, key, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const step of PIPELINE_STEPS) {
        insertStep.run(projectId, step.ordinal, step.key, now);
      }
    }).immediate();
  } catch (error) {
    await dependencies.localFiles.removeProject(input.userId, projectId);
    throw error;
  }

  return getProject(dependencies, input.userId, projectId);
}

export async function getManuscript(
  dependencies: ApplicationDependencies,
  userId: string,
  projectId: string,
): Promise<string> {
  const row = dependencies.database.prepare(`
    SELECT source_path
    FROM projects
    WHERE id = ? AND user_id = ?
  `).get(projectId, userId) as { source_path: string } | undefined;

  if (!row) throw projectNotFound();
  return dependencies.localFiles.readSource(row.source_path);
}
