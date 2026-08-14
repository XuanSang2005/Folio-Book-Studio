import { projectNotFound } from "../http/api-errors.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";
import type { GatewayImage } from "../integrations/gemini/gateway.js";

type ArtifactRow = {
  path: string | null;
  mime: string | null;
  byte_count: number | null;
  sha256: string | null;
  status: string;
};

async function readOwnedArtifact(
  dependencies: ApplicationDependencies,
  row: ArtifactRow | undefined,
): Promise<GatewayImage> {
  if (
    !row
    || row.status !== "succeeded"
    || !row.path
    || !row.mime
    || row.byte_count === null
    || !row.sha256
  ) throw projectNotFound();

  try {
    return await dependencies.artifactFiles.readImage(row.path, {
      mimeType: row.mime,
      byteCount: row.byte_count,
      sha256: row.sha256,
    });
  } catch {
    // A corrupt, missing, or escaping association is indistinguishable from a
    // missing resource at this owner-scoped boundary.
    throw projectNotFound();
  }
}

export async function getCharacterPortrait(
  dependencies: ApplicationDependencies,
  userId: string,
  projectId: string,
  characterId: string,
): Promise<GatewayImage> {
  const row = dependencies.database.prepare(`
    SELECT c.portrait_path AS path,
           c.portrait_mime AS mime,
           c.portrait_bytes AS byte_count,
           c.portrait_sha256 AS sha256,
           c.portrait_status AS status
    FROM characters c
    JOIN projects p ON p.id = c.project_id
    WHERE p.id = ? AND p.user_id = ? AND c.id = ?
  `).get(projectId, userId, characterId) as ArtifactRow | undefined;
  return readOwnedArtifact(dependencies, row);
}

export async function getChapterIllustration(
  dependencies: ApplicationDependencies,
  userId: string,
  projectId: string,
  chapterId: string,
): Promise<GatewayImage> {
  const row = dependencies.database.prepare(`
    SELECT c.illustration_path AS path,
           c.illustration_mime AS mime,
           c.illustration_bytes AS byte_count,
           c.illustration_sha256 AS sha256,
           c.illustration_status AS status
    FROM chapters c
    JOIN projects p ON p.id = c.project_id
    WHERE p.id = ? AND p.user_id = ? AND c.id = ?
  `).get(projectId, userId, chapterId) as ArtifactRow | undefined;
  return readOwnedArtifact(dependencies, row);
}
