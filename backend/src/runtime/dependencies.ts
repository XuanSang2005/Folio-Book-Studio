import type { Environment } from "../config/env.js";
import { openDatabase, type DatabaseConnection } from "../database/database.js";
import {
  UnconfiguredGeminiGateway,
  type GeminiGateway,
} from "../integrations/gemini/gateway.js";
import { GoogleGeminiGateway } from "../integrations/gemini/google-gemini-gateway.js";
import { systemClock, type Clock } from "./clock.js";
import {
  secureAttemptIdGenerator,
  type AttemptIdGenerator,
} from "./attempt-ids.js";
import {
  systemHeartbeatScheduler,
  type HeartbeatScheduler,
} from "./heartbeat-scheduler.js";
import { uuidIdGenerator, type IdGenerator } from "./ids.js";
import {
  secureSessionTokenGenerator,
  type SessionTokenGenerator,
} from "./session-tokens.js";
import { LocalFileStore, type SourceFileStore } from "../storage/local-file-store.js";
import {
  LocalArtifactStore,
  type ArtifactFileStore,
} from "../storage/local-artifact-store.js";
import {
  UnconfiguredStepExecutor,
  type StepExecutor,
} from "../pipeline/step-executor.js";
import { GeminiStepExecutor } from "../pipeline/gemini-step-executor.js";

export type ApplicationDependencies = {
  config: Environment;
  clock: Clock;
  ids: IdGenerator;
  gemini: GeminiGateway;
  database: DatabaseConnection;
  localFiles: SourceFileStore;
  artifactFiles: ArtifactFileStore;
  sessionTokens: SessionTokenGenerator;
  attemptIds: AttemptIdGenerator;
  heartbeatScheduler: HeartbeatScheduler;
  stepExecutor: StepExecutor;
};

export function createRuntimeDependencies(
  config: Environment,
): ApplicationDependencies {
  const database = openDatabase(config.DATABASE_PATH);
  const dependencies: ApplicationDependencies = {
    config,
    clock: systemClock,
    ids: uuidIdGenerator,
    gemini: new UnconfiguredGeminiGateway(),
    database,
    localFiles: new LocalFileStore(config.DATA_DIR, config.MAX_SOURCE_BYTES),
    artifactFiles: new LocalArtifactStore(config.DATA_DIR, config.MAX_IMAGE_BYTES),
    sessionTokens: secureSessionTokenGenerator,
    attemptIds: secureAttemptIdGenerator,
    heartbeatScheduler: systemHeartbeatScheduler,
    stepExecutor: new UnconfiguredStepExecutor(),
  };
  if (config.GEMINI_API_KEY) {
    dependencies.gemini = new GoogleGeminiGateway({
      apiKey: config.GEMINI_API_KEY,
      textModel: config.GEMINI_TEXT_MODEL,
      imageModel: config.GEMINI_IMAGE_MODEL,
      timeoutMs: config.GEMINI_REQUEST_TIMEOUT_MS,
    });
    dependencies.stepExecutor = new GeminiStepExecutor(dependencies);
  }
  return dependencies;
}
