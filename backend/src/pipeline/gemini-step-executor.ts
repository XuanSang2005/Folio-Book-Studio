import type { PipelineStepOrdinal } from "@gradion-folio/contracts";
import {
  GeminiGatewayError,
  imageInteractionId,
  textInteractionId,
  type GatewayChapter,
  type GatewayCharacter,
  type ProviderMetadata,
} from "../integrations/gemini/gateway.js";
import type { ApplicationDependencies } from "../runtime/dependencies.js";
import { ArtifactStorageError } from "../storage/local-artifact-store.js";
import {
  validatedChapter,
  validatedCharacters,
  validatedGatewayImage,
} from "./domain-validation.js";
import {
  AttemptOwnershipLostError,
  assertAttemptOwnership,
  beginProviderOperation,
  completeProviderOperation,
  failProviderOperation,
  type ActiveAttempt,
  type OperationDescriptor,
} from "./provider-operations.js";
import {
  BOOK_CONTEXT_PROMPT,
  CHAPTER_PROMPT,
  CHARACTERS_PROMPT,
  ILLUSTRATION_PROMPT,
  IMAGE_CONTEXT_PROMPT,
  PORTRAIT_PROMPT,
  STYLE_PROMPT,
} from "./prompts.js";
import {
  StepExecutionError,
  type StepExecutionContext,
  type StepExecutionResult,
  type StepExecutor,
} from "./step-executor.js";

type ProjectExecutionRow = {
  user_id: string;
  source_path: string;
  source_original_name: string | null;
  gemini_file_name: string | null;
  gemini_file_uri: string | null;
  gemini_file_expires_at: number | null;
  book_interaction_id: string | null;
  portrait_context_interaction_id: string | null;
  style_text: string | null;
  style_source: "user" | "generated" | null;
};

type CharacterExecutionRow = {
  id: string;
  position: number;
  name: string;
  role: string;
  age_group: "adult";
  prompt: string;
  portrait_status: "pending" | "running" | "succeeded" | "failed";
  portrait_path: string | null;
  portrait_mime: string | null;
  portrait_bytes: number | null;
  portrait_sha256: string | null;
  portrait_interaction_id: string | null;
};

type ChapterExecutionRow = {
  id: string;
  name: string;
  prompt: string;
  character_names_json: string;
  illustration_status: "pending" | "running" | "succeeded" | "failed";
  illustration_path: string | null;
  illustration_mime: string | null;
  illustration_bytes: number | null;
  illustration_sha256: string | null;
};

type ProviderResult = { provider: ProviderMetadata };

function executionFailure(error: unknown): StepExecutionError {
  if (error instanceof StepExecutionError) return error;
  if (error instanceof GeminiGatewayError) {
    return new StepExecutionError(error.code, error.message, error.httpStatus);
  }
  if (error instanceof ArtifactStorageError) {
    return new StepExecutionError(error.code, error.message, error.code === "LOCAL_IO_ERROR" ? 500 : 502);
  }
  return new StepExecutionError("PROVIDER_UNAVAILABLE", "Step execution failed.", 503);
}

function requiredTextInteraction(value: string | null): ReturnType<typeof textInteractionId> {
  if (!value) throw new StepExecutionError("CONTEXT_EXPIRED", "The required Gemini text context is unavailable.", 409);
  return textInteractionId(value);
}

function requiredImageInteraction(value: string | null): ReturnType<typeof imageInteractionId> {
  if (!value) throw new StepExecutionError("CONTEXT_EXPIRED", "The required Gemini image context is unavailable.", 409);
  return imageInteractionId(value);
}

function validProviderFile(row: ProjectExecutionRow): boolean {
  return Boolean(row.gemini_file_name && row.gemini_file_uri);
}

export class GeminiStepExecutor implements StepExecutor {
  constructor(private readonly dependencies: ApplicationDependencies) {}

  async validateCompletedPortraits(projectId: string): Promise<void> {
    const characters = this.characters(projectId);
    if (characters.length === 0) {
      throw new StepExecutionError("INVALID_MODEL_OUTPUT", "The persisted cast is unavailable.", 500);
    }
    try {
      for (const character of characters) {
        if (
          character.portrait_status !== "succeeded"
          || !character.portrait_path
          || !character.portrait_mime
          || character.portrait_bytes === null
          || !character.portrait_sha256
          || !character.portrait_interaction_id
        ) {
          throw new StepExecutionError("LOCAL_IO_ERROR", "A completed portrait association is invalid.", 500);
        }
        await this.dependencies.artifactFiles.readImage(character.portrait_path, {
          mimeType: character.portrait_mime,
          byteCount: character.portrait_bytes,
          sha256: character.portrait_sha256,
        });
      }
    } catch (error) {
      throw executionFailure(error);
    }
  }

  async execute(context: StepExecutionContext): Promise<StepExecutionResult> {
    const attempt: ActiveAttempt = {
      projectId: context.projectId,
      ordinal: context.ordinal,
      attemptId: context.attemptId,
    };
    assertAttemptOwnership(this.dependencies, attempt);

    switch (context.ordinal) {
      case 1: await this.runStyle(context, attempt); break;
      case 2: await this.runCharacters(attempt); break;
      case 3: await this.runPortraits(context, attempt); break;
      case 4: await this.runChapter(attempt); break;
      case 5: await this.runIllustration(context, attempt); break;
    }
    return {};
  }

  private project(projectId: string): ProjectExecutionRow {
    const row = this.dependencies.database.prepare(`
      SELECT user_id, source_path, source_original_name,
             gemini_file_name, gemini_file_uri, gemini_file_expires_at,
             book_interaction_id, portrait_context_interaction_id,
             style_text, style_source
      FROM projects
      WHERE id = ?
    `).get(projectId) as ProjectExecutionRow | undefined;
    if (!row) throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Pipeline project state is unavailable.", 500);
    return row;
  }

  private characters(projectId: string): CharacterExecutionRow[] {
    return this.dependencies.database.prepare(`
      SELECT id, position, name, role, age_group, prompt,
             portrait_status, portrait_path, portrait_mime, portrait_bytes,
             portrait_sha256, portrait_interaction_id
      FROM characters
      WHERE project_id = ?
      ORDER BY position
    `).all(projectId) as CharacterExecutionRow[];
  }

  private chapter(projectId: string): ChapterExecutionRow | undefined {
    return this.dependencies.database.prepare(`
      SELECT id, name, prompt, character_names_json, illustration_status,
             illustration_path, illustration_mime, illustration_bytes,
             illustration_sha256
      FROM chapters
      WHERE project_id = ? AND position = 0
    `).get(projectId) as ChapterExecutionRow | undefined;
  }

  private stepInteraction(projectId: string, ordinal: PipelineStepOrdinal): string | null {
    const row = this.dependencies.database.prepare(`
      SELECT interaction_id FROM pipeline_steps WHERE project_id = ? AND ordinal = ?
    `).get(projectId, ordinal) as { interaction_id: string | null } | undefined;
    return row?.interaction_id ?? null;
  }

  private async operation<Result extends ProviderResult>(
    attempt: ActiveAttempt,
    descriptor: OperationDescriptor,
    invoke: () => Promise<Result>,
    validate: (result: Result) => void,
    checkpoint: (result: Result) => void,
  ): Promise<Result> {
    const operationId = beginProviderOperation(this.dependencies, attempt, descriptor);
    try {
      const result = await invoke();
      validate(result);
      completeProviderOperation(
        this.dependencies,
        attempt,
        operationId,
        result.provider,
        () => checkpoint(result),
      );
      return result;
    } catch (error) {
      if (error instanceof AttemptOwnershipLostError) throw error;
      const failure = executionFailure(error);
      if (!failProviderOperation(this.dependencies, attempt, operationId, failure)) {
        throw new AttemptOwnershipLostError();
      }
      throw failure;
    }
  }

  private async runStyle(context: StepExecutionContext, attempt: ActiveAttempt): Promise<void> {
    let project = this.project(attempt.projectId);

    if (!project.book_interaction_id && !validProviderFile(project)) {
      if (project.gemini_file_name || project.gemini_file_uri || project.gemini_file_expires_at) {
        throw new StepExecutionError("CONTEXT_EXPIRED", "The saved Gemini file context is incomplete.", 409);
      }
      const manuscript = new TextEncoder().encode(
        await this.dependencies.localFiles.readSource(project.source_path),
      );
      await this.operation(
        attempt,
        {
          operationKey: "source-upload",
          modelId: "gemini-files-api",
          promptVersion: "source-upload.v1",
        },
        () => this.dependencies.gemini.uploadSource({
          projectId: attempt.projectId,
          originalName: project.source_original_name ?? "book.txt",
          bytes: manuscript,
          mimeType: "text/plain",
        }),
        (result) => {
          if (!result.file.providerFileName.trim() || !result.file.uri.trim()) {
            throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Gemini returned an invalid file reference.", 502);
          }
        },
        (result) => {
          const expiresAt = result.file.expiresAt ? Date.parse(result.file.expiresAt) : null;
          this.dependencies.database.prepare(`
            UPDATE projects
            SET gemini_file_name = ?, gemini_file_uri = ?, gemini_file_expires_at = ?, updated_at = ?
            WHERE id = ?
          `).run(
            result.file.providerFileName,
            result.file.uri,
            expiresAt !== null && Number.isFinite(expiresAt) ? expiresAt : null,
            this.dependencies.clock.now().getTime(),
            attempt.projectId,
          );
        },
      );
      project = this.project(attempt.projectId);
    }

    if (!project.book_interaction_id) {
      if (
        project.gemini_file_expires_at !== null
        && project.gemini_file_expires_at <= this.dependencies.clock.now().getTime()
      ) {
        throw new StepExecutionError("CONTEXT_EXPIRED", "The Gemini source file context has expired.", 409);
      }
      await this.operation(
        attempt,
        {
          operationKey: "book-context",
          modelId: this.dependencies.config.GEMINI_TEXT_MODEL,
          promptVersion: BOOK_CONTEXT_PROMPT.version,
          inputContextKey: "project.sourceFile",
        },
        () => this.dependencies.gemini.createBookContext({
          projectId: attempt.projectId,
          source: {
            providerFileName: project.gemini_file_name!,
            uri: project.gemini_file_uri!,
            ...(project.gemini_file_expires_at === null
              ? {}
              : { expiresAt: new Date(project.gemini_file_expires_at).toISOString() }),
          },
        }),
        () => undefined,
        (result) => {
          this.dependencies.database.prepare(`
            UPDATE projects SET book_interaction_id = ?, updated_at = ? WHERE id = ?
          `).run(
            result.provider.interactionId,
            this.dependencies.clock.now().getTime(),
            attempt.projectId,
          );
        },
      );
      project = this.project(attempt.projectId);
    }

    if (project.style_text) return;
    if (context.artDirection) {
      if (!context.checkpointResult({ styleSource: "user" })) throw new AttemptOwnershipLostError();
      this.dependencies.database.transaction(() => {
        assertAttemptOwnership(this.dependencies, attempt);
        this.dependencies.database.prepare(`
          UPDATE projects
          SET style_text = ?, style_source = 'user', updated_at = ?
          WHERE id = ?
        `).run(context.artDirection, this.dependencies.clock.now().getTime(), attempt.projectId);
      }).immediate();
      return;
    }

    const bookContext = requiredTextInteraction(project.book_interaction_id);
    await this.operation(
      attempt,
      {
        operationKey: "style",
        modelId: this.dependencies.config.GEMINI_TEXT_MODEL,
        promptVersion: STYLE_PROMPT.version,
        inputContextKey: "project.bookInteraction",
      },
      () => this.dependencies.gemini.defineStyle({ previousInteractionId: bookContext }),
      (result) => {
        if (!result.style.trim()) {
          throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Gemini returned an empty art style.", 502);
        }
      },
      (result) => {
        const now = this.dependencies.clock.now().getTime();
        this.dependencies.database.prepare(`
          UPDATE projects
          SET style_text = ?, style_source = 'generated', updated_at = ?
          WHERE id = ?
        `).run(result.style.trim(), now, attempt.projectId);
        this.dependencies.database.prepare(`
          UPDATE pipeline_steps SET interaction_id = ?, updated_at = ?
          WHERE project_id = ? AND ordinal = 1
        `).run(result.provider.interactionId, now, attempt.projectId);
      },
    );
  }

  private async runCharacters(attempt: ActiveAttempt): Promise<void> {
    const project = this.project(attempt.projectId);
    const existing = this.characters(attempt.projectId);
    if (existing.length > 0 && this.stepInteraction(attempt.projectId, 2)) return;
    if (!project.style_text) {
      throw new StepExecutionError("CONTEXT_EXPIRED", "The required style context is unavailable.", 409);
    }
    const previous = requiredTextInteraction(
      project.style_source === "user"
        ? project.book_interaction_id
        : this.stepInteraction(attempt.projectId, 1),
    );

    await this.operation(
      attempt,
      {
        operationKey: "characters",
        modelId: this.dependencies.config.GEMINI_TEXT_MODEL,
        promptVersion: CHARACTERS_PROMPT.version,
        inputContextKey: project.style_source === "user"
          ? "project.bookInteraction"
          : "step.1.interaction",
      },
      () => this.dependencies.gemini.extractCharacters({
        previousInteractionId: previous,
        style: project.style_text!,
      }),
      (result) => { validatedCharacters(result.characters); },
      (result) => {
        const characters = validatedCharacters(result.characters);
        const now = this.dependencies.clock.now().getTime();
        this.dependencies.database.prepare("DELETE FROM characters WHERE project_id = ?")
          .run(attempt.projectId);
        const insert = this.dependencies.database.prepare(`
          INSERT INTO characters (
            id, project_id, position, name, role, age_group, prompt, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'adult', ?, ?, ?)
        `);
        characters.forEach((character, position) => {
          insert.run(
            this.dependencies.ids.generate(),
            attempt.projectId,
            position,
            character.name,
            character.role,
            character.prompt,
            now,
            now,
          );
        });
        this.dependencies.database.prepare(`
          UPDATE pipeline_steps SET interaction_id = ?, updated_at = ?
          WHERE project_id = ? AND ordinal = 2
        `).run(result.provider.interactionId, now, attempt.projectId);
      },
    );
  }

  private async runPortraits(context: StepExecutionContext, attempt: ActiveAttempt): Promise<void> {
    let project = this.project(attempt.projectId);
    let characters = this.characters(attempt.projectId);
    if (characters.length === 0 || !project.style_text) {
      throw new StepExecutionError("CONTEXT_EXPIRED", "The portrait inputs are unavailable.", 409);
    }
    const style = project.style_text;

    if (!project.portrait_context_interaction_id) {
      await this.operation(
        attempt,
        {
          operationKey: "image-context",
          modelId: this.dependencies.config.GEMINI_IMAGE_MODEL,
          promptVersion: IMAGE_CONTEXT_PROMPT.version,
          inputContextKey: "project.style",
        },
        () => this.dependencies.gemini.createImageContext({ style }),
        () => undefined,
        (result) => {
          this.dependencies.database.prepare(`
            UPDATE projects SET portrait_context_interaction_id = ?, updated_at = ? WHERE id = ?
          `).run(
            result.provider.interactionId,
            this.dependencies.clock.now().getTime(),
            attempt.projectId,
          );
        },
      );
      project = this.project(attempt.projectId);
    }

    let previousImageInteraction = requiredImageInteraction(project.portrait_context_interaction_id);
    for (const character of characters) {
      if (character.portrait_status === "succeeded" && character.portrait_interaction_id) {
        previousImageInteraction = imageInteractionId(character.portrait_interaction_id);
        continue;
      }
      if (!context.portraits.some(({ characterId }) => characterId === character.id)) continue;
      if (!context.checkpointPortrait({ characterId: character.id, status: "running" })) {
        throw new AttemptOwnershipLostError();
      }

      const operationId = beginProviderOperation(this.dependencies, attempt, {
        operationKey: `portrait:${character.id}`,
        itemId: character.id,
        modelId: this.dependencies.config.GEMINI_IMAGE_MODEL,
        promptVersion: PORTRAIT_PROMPT.version,
        inputContextKey: previousImageInteraction === project.portrait_context_interaction_id
          ? "project.portraitContext"
          : "previousCharacter.portraitInteraction",
      });
      let storedPath: string | undefined;
      try {
        const result = await this.dependencies.gemini.generatePortrait({
          characterId: character.id,
          character: {
            name: character.name,
            role: character.role,
            ageGroup: character.age_group,
            prompt: character.prompt,
          },
          style,
          previousImageInteractionId: previousImageInteraction,
        });
        if (result.characterId !== character.id) {
          throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Gemini returned a portrait for the wrong character.", 502);
        }
        const image = validatedGatewayImage(result.image);
        const stored = await this.dependencies.artifactFiles.writeImage({
          userId: project.user_id,
          projectId: attempt.projectId,
          kind: "portraits",
          itemId: character.id,
          attemptId: attempt.attemptId,
          image,
        });
        storedPath = stored.relativePath;
        completeProviderOperation(
          this.dependencies,
          attempt,
          operationId,
          result.provider,
          () => {
            if (!context.checkpointPortrait({
              characterId: character.id,
              status: "succeeded",
              portraitPath: stored.relativePath,
              portraitMime: stored.mimeType,
              portraitBytes: stored.byteCount,
              portraitSha256: stored.sha256,
              portraitInteractionId: result.provider.interactionId,
            })) throw new AttemptOwnershipLostError();
          },
        );
        previousImageInteraction = result.provider.interactionId;
      } catch (error) {
        if (storedPath) await this.dependencies.artifactFiles.remove(storedPath);
        if (error instanceof AttemptOwnershipLostError) throw error;
        const failure = executionFailure(error);
        if (!failProviderOperation(this.dependencies, attempt, operationId, failure)) {
          throw new AttemptOwnershipLostError();
        }
        if (!context.checkpointPortrait({
          characterId: character.id,
          status: "failed",
          errorCode: failure.code,
          errorMessage: failure.message,
        })) throw new AttemptOwnershipLostError();
        throw failure;
      }
    }
    characters = this.characters(attempt.projectId);
    if (characters.some(({ portrait_status: status }) => status !== "succeeded")) {
      throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Portrait generation did not complete the persisted cast.", 502);
    }
  }

  private async runChapter(attempt: ActiveAttempt): Promise<void> {
    const existing = this.chapter(attempt.projectId);
    if (existing && this.stepInteraction(attempt.projectId, 4)) return;
    const project = this.project(attempt.projectId);
    const characters = this.characters(attempt.projectId);
    const previous = requiredTextInteraction(this.stepInteraction(attempt.projectId, 2));
    if (!project.style_text || characters.length === 0) {
      throw new StepExecutionError("CONTEXT_EXPIRED", "The chapter inputs are unavailable.", 409);
    }
    const gatewayCharacters: GatewayCharacter[] = characters.map((character) => ({
      name: character.name,
      role: character.role,
      ageGroup: character.age_group,
      prompt: character.prompt,
    }));

    await this.operation(
      attempt,
      {
        operationKey: "chapter",
        modelId: this.dependencies.config.GEMINI_TEXT_MODEL,
        promptVersion: CHAPTER_PROMPT.version,
        inputContextKey: "step.2.interaction",
      },
      () => this.dependencies.gemini.extractChapter({
        previousInteractionId: previous,
        style: project.style_text!,
        characters: gatewayCharacters,
      }),
      (result) => { validatedChapter(result.chapters, characters.map(({ name }) => name)); },
      (result) => {
        const chapter = validatedChapter(result.chapters, characters.map(({ name }) => name));
        const now = this.dependencies.clock.now().getTime();
        this.dependencies.database.prepare("DELETE FROM chapters WHERE project_id = ?")
          .run(attempt.projectId);
        this.dependencies.database.prepare(`
          INSERT INTO chapters (
            id, project_id, position, name, prompt, character_names_json, created_at, updated_at
          ) VALUES (?, ?, 0, ?, ?, ?, ?, ?)
        `).run(
          this.dependencies.ids.generate(),
          attempt.projectId,
          chapter.name,
          chapter.prompt,
          JSON.stringify(chapter.characterNames),
          now,
          now,
        );
        this.dependencies.database.prepare(`
          UPDATE pipeline_steps SET interaction_id = ?, updated_at = ?
          WHERE project_id = ? AND ordinal = 4
        `).run(result.provider.interactionId, now, attempt.projectId);
      },
    );
  }

  private async runIllustration(context: StepExecutionContext, attempt: ActiveAttempt): Promise<void> {
    const project = this.project(attempt.projectId);
    const chapter = this.chapter(attempt.projectId);
    const characters = this.characters(attempt.projectId);
    if (!chapter || !project.style_text) {
      throw new StepExecutionError("CONTEXT_EXPIRED", "The illustration inputs are unavailable.", 409);
    }
    if (
      chapter.illustration_status === "succeeded"
      && chapter.illustration_path
      && chapter.illustration_mime
      && chapter.illustration_bytes !== null
      && chapter.illustration_sha256
    ) {
      await this.dependencies.artifactFiles.readImage(chapter.illustration_path, {
        mimeType: chapter.illustration_mime,
        byteCount: chapter.illustration_bytes,
        sha256: chapter.illustration_sha256,
      });
      return;
    }

    const names: unknown = JSON.parse(chapter.character_names_json);
    if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) {
      throw new StepExecutionError("INVALID_MODEL_OUTPUT", "Stored chapter character references are invalid.", 500);
    }
    const references = [];
    for (const name of names) {
      const character = characters.find((candidate) => candidate.name === name);
      if (
        !character
        || character.portrait_status !== "succeeded"
        || !character.portrait_path
        || !character.portrait_mime
        || character.portrait_bytes === null
        || !character.portrait_sha256
      ) {
        throw new StepExecutionError("LOCAL_IO_ERROR", "A required portrait reference is unavailable.", 500);
      }
      const image = await this.dependencies.artifactFiles.readImage(character.portrait_path, {
        mimeType: character.portrait_mime,
        byteCount: character.portrait_bytes,
        sha256: character.portrait_sha256,
      });
      references.push({ characterId: character.id, characterName: character.name, image });
    }
    if (!context.checkpointIllustration({ chapterId: chapter.id, status: "running" })) {
      throw new AttemptOwnershipLostError();
    }

    const operationId = beginProviderOperation(this.dependencies, attempt, {
      operationKey: `illustration:${chapter.id}`,
      itemId: chapter.id,
      modelId: this.dependencies.config.GEMINI_IMAGE_MODEL,
      promptVersion: ILLUSTRATION_PROMPT.version,
      inputContextKey: "chapter.localPortraitReferences",
    });
    let storedPath: string | undefined;
    try {
      const chapterInput: GatewayChapter = {
        name: chapter.name,
        prompt: chapter.prompt,
        characterNames: names,
      };
      const result = await this.dependencies.gemini.generateIllustration({
        style: project.style_text,
        chapter: chapterInput,
        portraitReferences: references,
      });
      const image = validatedGatewayImage(result.image);
      const stored = await this.dependencies.artifactFiles.writeImage({
        userId: project.user_id,
        projectId: attempt.projectId,
        kind: "illustrations",
        itemId: chapter.id,
        attemptId: attempt.attemptId,
        image,
      });
      storedPath = stored.relativePath;
      completeProviderOperation(
        this.dependencies,
        attempt,
        operationId,
        result.provider,
        () => {
          if (!context.checkpointIllustration({
            chapterId: chapter.id,
            status: "succeeded",
            illustrationPath: stored.relativePath,
            illustrationMime: stored.mimeType,
            illustrationBytes: stored.byteCount,
            illustrationSha256: stored.sha256,
            illustrationInteractionId: result.provider.interactionId,
          })) throw new AttemptOwnershipLostError();
        },
      );
    } catch (error) {
      if (storedPath) await this.dependencies.artifactFiles.remove(storedPath);
      if (error instanceof AttemptOwnershipLostError) throw error;
      const failure = executionFailure(error);
      if (!failProviderOperation(this.dependencies, attempt, operationId, failure)) {
        throw new AttemptOwnershipLostError();
      }
      if (!context.checkpointIllustration({
        chapterId: chapter.id,
        status: "failed",
        errorCode: failure.code,
        errorMessage: failure.message,
      })) throw new AttemptOwnershipLostError();
      throw failure;
    }
  }
}
