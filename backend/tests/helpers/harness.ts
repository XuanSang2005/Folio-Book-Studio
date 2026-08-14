import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../../src/app.js";
import { parseEnvironment, type Environment } from "../../src/config/env.js";
import { openDatabase, type DatabaseConnection } from "../../src/database/database.js";
import type { ApplicationDependencies } from "../../src/runtime/dependencies.js";
import { LocalFileStore, type SourceFileStore } from "../../src/storage/local-file-store.js";
import {
  LocalArtifactStore,
  type ArtifactFileStore,
} from "../../src/storage/local-artifact-store.js";
import { GeminiStepExecutor } from "../../src/pipeline/gemini-step-executor.js";
import type { SessionTokenGenerator } from "../../src/runtime/session-tokens.js";
import type { AttemptIdGenerator } from "../../src/runtime/attempt-ids.js";
import type { HeartbeatScheduler } from "../../src/runtime/heartbeat-scheduler.js";
import type { StepExecutor } from "../../src/pipeline/step-executor.js";
import {
  FakeAttemptIdGenerator,
  FakeClock,
  FakeGeminiGateway,
  FakeHeartbeatScheduler,
  FakeIdGenerator,
  FakeSessionTokenGenerator,
  FakeStepExecutor,
} from "./fakes.js";

export type TestHarness = {
  app: ReturnType<typeof buildApp>;
  config: Environment;
  dependencies: ApplicationDependencies;
  clock: FakeClock;
  ids: FakeIdGenerator;
  gemini: FakeGeminiGateway;
  database: DatabaseConnection;
  localFiles: SourceFileStore;
  artifactFiles: ArtifactFileStore;
  sessionTokens: SessionTokenGenerator;
  attemptIds: AttemptIdGenerator;
  heartbeatScheduler: HeartbeatScheduler;
  stepExecutor: StepExecutor;
  temporaryDirectory: string;
  cleanup(): Promise<void>;
};

export async function createTestHarness(options: {
  clock?: FakeClock;
  ids?: FakeIdGenerator;
  gemini?: FakeGeminiGateway;
  environment?: NodeJS.ProcessEnv;
  temporaryDirectoryParent?: string;
  temporaryDirectory?: string;
  localFiles?: SourceFileStore;
  artifactFiles?: ArtifactFileStore;
  sessionTokens?: SessionTokenGenerator;
  attemptIds?: AttemptIdGenerator;
  heartbeatScheduler?: HeartbeatScheduler;
  stepExecutor?: StepExecutor;
  useGeminiStepExecutor?: boolean;
} = {}): Promise<TestHarness> {
  const ownsTemporaryDirectory = options.temporaryDirectory === undefined;
  const temporaryDirectory = options.temporaryDirectory ?? await mkdtemp(join(
    options.temporaryDirectoryParent ?? tmpdir(),
    "gradion-folio-test-",
  ));
  await mkdir(temporaryDirectory, { recursive: true });
  let database: DatabaseConnection | undefined;

  try {
    const config = parseEnvironment({
      NODE_ENV: "test",
      DATA_DIR: temporaryDirectory,
      DATABASE_PATH: join(temporaryDirectory, "folio.sqlite"),
      ...options.environment,
    });
    const clock = options.clock ?? new FakeClock();
    const ids = options.ids ?? new FakeIdGenerator();
    const gemini = options.gemini ?? new FakeGeminiGateway();
    database = openDatabase(config.DATABASE_PATH);
    const localFiles = options.localFiles
      ?? new LocalFileStore(config.DATA_DIR, config.MAX_SOURCE_BYTES);
    const artifactFiles = options.artifactFiles
      ?? new LocalArtifactStore(config.DATA_DIR, config.MAX_IMAGE_BYTES);
    const sessionTokens = options.sessionTokens ?? new FakeSessionTokenGenerator();
    const attemptIds = options.attemptIds ?? new FakeAttemptIdGenerator();
    const heartbeatScheduler = options.heartbeatScheduler ?? new FakeHeartbeatScheduler();
    const dependencies = {
      config,
      clock,
      ids,
      gemini,
      database,
      localFiles,
      artifactFiles,
      sessionTokens,
      attemptIds,
      heartbeatScheduler,
      stepExecutor: options.stepExecutor ?? new FakeStepExecutor(),
    } satisfies ApplicationDependencies;
    if (options.useGeminiStepExecutor) {
      dependencies.stepExecutor = new GeminiStepExecutor(dependencies);
    }
    const stepExecutor = dependencies.stepExecutor;
    const app = buildApp({ dependencies });
    let cleaned = false;

    return {
      app,
      config,
      dependencies,
      clock,
      ids,
      gemini,
      database,
      localFiles,
      artifactFiles,
      sessionTokens,
      attemptIds,
      heartbeatScheduler,
      stepExecutor,
      temporaryDirectory,
      async cleanup() {
        if (cleaned) return;
        cleaned = true;
        try {
          await app.close();
        } finally {
          if (ownsTemporaryDirectory) {
            await rm(temporaryDirectory, { recursive: true, force: true });
          }
        }
      },
    };
  } catch (error) {
    if (database?.open) database.close();
    if (ownsTemporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    throw error;
  }
}
