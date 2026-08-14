import type {
  BookContextResult,
  ChapterInput,
  ChapterResult,
  CharactersInput,
  CharactersResult,
  CreateBookContextInput,
  CreateImageContextInput,
  GeminiGateway,
  GatewayImage,
  IllustrationInput,
  IllustrationResult,
  ImageContextResult,
  PortraitInput,
  PortraitResult,
  StyleInput,
  StyleResult,
  UploadSourceInput,
  UploadSourceResult,
} from "../../src/integrations/gemini/gateway.js";
import {
  imageInteractionId,
  textInteractionId,
} from "../../src/integrations/gemini/gateway.js";
import type { Clock } from "../../src/runtime/clock.js";
import type { AttemptIdGenerator } from "../../src/runtime/attempt-ids.js";
import type {
  HeartbeatScheduler,
  ScheduledHeartbeat,
} from "../../src/runtime/heartbeat-scheduler.js";
import type { IdGenerator } from "../../src/runtime/ids.js";
import type {
  StepExecutionContext,
  StepExecutionResult,
  StepExecutor,
} from "../../src/pipeline/step-executor.js";

export class FakeClock implements Clock {
  private currentTimeMs: number;

  constructor(initialTime: Date | string | number = "2026-08-13T00:00:00.000Z") {
    this.currentTimeMs = new Date(initialTime).getTime();
    if (!Number.isFinite(this.currentTimeMs)) throw new Error("FakeClock requires a valid initial time");
  }

  now(): Date {
    return new Date(this.currentTimeMs);
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error("FakeClock can only advance by a non-negative duration");
    }
    this.currentTimeMs += milliseconds;
  }
}

export class FakeIdGenerator implements IdGenerator {
  private nextValue = 1;

  generate(): string {
    const value = `00000000-0000-4000-8000-${String(this.nextValue).padStart(12, "0")}`;
    this.nextValue += 1;
    return value;
  }
}

export class FakeSessionTokenGenerator {
  private nextValue = 1;

  generate(): string {
    const value = `test-session-token-${String(this.nextValue).padStart(4, "0")}`;
    this.nextValue += 1;
    return value;
  }
}

export class FakeAttemptIdGenerator implements AttemptIdGenerator {
  private nextValue = 1;

  generate(): string {
    const value = `10000000-0000-4000-8000-${String(this.nextValue).padStart(12, "0")}`;
    this.nextValue += 1;
    return value;
  }
}

export class FakeHeartbeatScheduler implements HeartbeatScheduler {
  private readonly callbacks = new Set<() => void>();
  readonly intervals: number[] = [];

  get activeCount(): number {
    return this.callbacks.size;
  }

  every(milliseconds: number, callback: () => void): ScheduledHeartbeat {
    this.intervals.push(milliseconds);
    this.callbacks.add(callback);
    return { cancel: () => this.callbacks.delete(callback) };
  }

  tick(): void {
    for (const callback of [...this.callbacks]) callback();
  }

  close(): void {
    this.callbacks.clear();
  }
}

export type FakeStepCall = {
  projectId: string;
  ordinal: StepExecutionContext["ordinal"];
  attemptNumber: number;
  artDirection?: string;
  portraits: StepExecutionContext["portraits"];
};

export type FakeStepHandler = (
  context: StepExecutionContext,
) => Promise<StepExecutionResult> | StepExecutionResult;

export class FakeStepExecutor implements StepExecutor {
  private readonly handlers: FakeStepHandler[];
  private readonly recordedCalls: FakeStepCall[] = [];

  constructor(handlers: FakeStepHandler[] = []) {
    this.handlers = handlers.slice();
  }

  get calls(): readonly FakeStepCall[] {
    return this.recordedCalls;
  }

  enqueue(handler: FakeStepHandler): void {
    this.handlers.push(handler);
  }

  clearCalls(): void {
    this.recordedCalls.length = 0;
  }

  async execute(context: StepExecutionContext): Promise<StepExecutionResult> {
    this.recordedCalls.push({
      projectId: context.projectId,
      ordinal: context.ordinal,
      attemptNumber: context.attemptNumber,
      ...(context.artDirection ? { artDirection: context.artDirection } : {}),
      portraits: structuredClone(context.portraits),
    });
    const handler = this.handlers.shift();
    return handler ? handler(context) : { result: { fake: true } };
  }
}

export const VALID_PNG_FIXTURE: GatewayImage = {
  bytes: Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  )),
  mimeType: "image/png",
};

export const MALFORMED_PNG_FIXTURE: GatewayImage = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  mimeType: "image/png",
};

export type ManualDeferred<Result> = {
  promise: Promise<Result>;
  resolve(value: Result): void;
  reject(reason?: unknown): void;
};

export function createDeferred<Result>(): ManualDeferred<Result> {
  let resolvePromise!: (value: Result) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<Result>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

export type GeminiOperationName =
  | "uploadSource"
  | "createBookContext"
  | "defineStyle"
  | "extractCharacters"
  | "createImageContext"
  | "generatePortrait"
  | "extractChapter"
  | "generateIllustration";

export type GeminiOperation = {
  sequence: number;
  name: GeminiOperationName;
  callIndex: number;
  input: unknown;
};

type GeminiResultMap = {
  uploadSource: UploadSourceResult;
  createBookContext: BookContextResult;
  defineStyle: StyleResult;
  extractCharacters: CharactersResult;
  createImageContext: ImageContextResult;
  generatePortrait: PortraitResult;
  extractChapter: ChapterResult;
  generateIllustration: IllustrationResult;
};

export type ScriptedOutcome<Result> =
  | { kind: "success"; value: Result }
  | { kind: "error"; error: Error }
  | { kind: "malformed"; value: unknown }
  | { kind: "deferred"; deferred: ManualDeferred<Result> };

export type FakeGeminiScripts = {
  [Name in GeminiOperationName]?: ScriptedOutcome<GeminiResultMap[Name]>[];
};

export type FakeGeminiGatewayOptions = {
  scripts?: FakeGeminiScripts;
};

const DEFAULT_CHARACTERS = [{
  name: "Mole",
  role: "The curious homebody",
  ageGroup: "adult" as const,
  prompt: "Create a full-length adult Mole with velvety charcoal fur, a rounded muzzle, thoughtful dark eyes, and practical earth-toned country clothes. He stands with gentle uncertainty beside a riverbank, holding a worn walking stick. Use expressive natural posture, carefully observed fabric, soft rim light, watercolor texture, ink contours, grounded proportions, and a quiet, kind emotional presence throughout the portrait.",
}, {
  name: "Water Rat",
  role: "The confident river guide",
  ageGroup: "adult" as const,
  prompt: "Create a full-length adult Water Rat with warm brown fur, bright observant eyes, a neat whiskered muzzle, and a weathered blue river jacket. He carries a polished oar and picnic basket with relaxed confidence. Use lively but natural posture, detailed cloth and fur, clear silhouette, watercolor washes, fine ink contours, gentle daylight, and an adventurous yet trustworthy emotional presence.",
}];

function textProvider(operation: string, callIndex: number) {
  const suffix = String(callIndex).padStart(4, "0");
  return {
    modelId: "fake-text-model",
    requestId: `request-${operation}-${suffix}`,
    interactionId: textInteractionId(`text-${operation}-${suffix}`),
  };
}

function imageProvider(operation: string, callIndex: number) {
  const suffix = String(callIndex).padStart(4, "0");
  return {
    modelId: "fake-image-model",
    requestId: `request-${operation}-${suffix}`,
    interactionId: imageInteractionId(`image-${operation}-${suffix}`),
  };
}

export class FakeGeminiGateway implements GeminiGateway {
  private readonly recordedOperations: GeminiOperation[] = [];
  private readonly callCounts: Partial<Record<GeminiOperationName, number>> = {};
  private readonly scripts: FakeGeminiScripts;

  constructor({ scripts = {} }: FakeGeminiGatewayOptions = {}) {
    this.scripts = {
      uploadSource: scripts.uploadSource?.slice(),
      createBookContext: scripts.createBookContext?.slice(),
      defineStyle: scripts.defineStyle?.slice(),
      extractCharacters: scripts.extractCharacters?.slice(),
      createImageContext: scripts.createImageContext?.slice(),
      generatePortrait: scripts.generatePortrait?.slice(),
      extractChapter: scripts.extractChapter?.slice(),
      generateIllustration: scripts.generateIllustration?.slice(),
    };
  }

  get operations(): readonly GeminiOperation[] {
    return this.recordedOperations;
  }

  clearOperations(): void {
    this.recordedOperations.length = 0;
    for (const name of Object.keys(this.callCounts) as GeminiOperationName[]) {
      delete this.callCounts[name];
    }
  }

  enqueue<Name extends GeminiOperationName>(
    name: Name,
    outcome: ScriptedOutcome<GeminiResultMap[Name]>,
  ): void {
    const queue = (this.scripts[name] ??= []) as ScriptedOutcome<GeminiResultMap[Name]>[];
    queue.push(outcome);
  }

  private async execute<Name extends GeminiOperationName>(
    name: Name,
    input: unknown,
    fallback: (callIndex: number) => GeminiResultMap[Name],
  ): Promise<GeminiResultMap[Name]> {
    const callIndex = (this.callCounts[name] ?? 0) + 1;
    this.callCounts[name] = callIndex;
    this.recordedOperations.push({
      sequence: this.recordedOperations.length + 1,
      name,
      callIndex,
      input: structuredClone(input),
    });

    const queue = this.scripts[name] as ScriptedOutcome<GeminiResultMap[Name]>[] | undefined;
    const outcome = queue?.shift();
    if (!outcome) return structuredClone(fallback(callIndex));

    switch (outcome.kind) {
      case "success":
        return structuredClone(outcome.value);
      case "error":
        throw outcome.error;
      case "malformed":
        return structuredClone(outcome.value) as GeminiResultMap[Name];
      case "deferred":
        return structuredClone(await outcome.deferred.promise);
    }
  }

  async uploadSource(input: UploadSourceInput): Promise<UploadSourceResult> {
    return this.execute("uploadSource", input, (callIndex) => ({
      file: {
        providerFileName: `files/source-${String(callIndex).padStart(4, "0")}`,
        uri: `https://provider.invalid/files/source-${String(callIndex).padStart(4, "0")}`,
        expiresAt: "2026-08-14T00:00:00.000Z",
      },
      provider: {
        modelId: "fake-files-api",
        requestId: `request-upload-${String(callIndex).padStart(4, "0")}`,
      },
    }));
  }

  async createBookContext(input: CreateBookContextInput): Promise<BookContextResult> {
    return this.execute("createBookContext", input, (callIndex) => ({
      provider: textProvider("book", callIndex),
    }));
  }

  async defineStyle(input: StyleInput): Promise<StyleResult> {
    return this.execute("defineStyle", input, (callIndex) => ({
      style: "Deterministic ink and watercolour style.",
      provider: textProvider("style", callIndex),
    }));
  }

  async extractCharacters(input: CharactersInput): Promise<CharactersResult> {
    return this.execute("extractCharacters", input, (callIndex) => ({
      characters: DEFAULT_CHARACTERS,
      provider: textProvider("characters", callIndex),
    }));
  }

  async createImageContext(input: CreateImageContextInput): Promise<ImageContextResult> {
    return this.execute("createImageContext", input, (callIndex) => ({
      provider: imageProvider("context", callIndex),
    }));
  }

  async generatePortrait(input: PortraitInput): Promise<PortraitResult> {
    return this.execute("generatePortrait", input, (callIndex) => ({
      characterId: input.characterId,
      image: VALID_PNG_FIXTURE,
      provider: imageProvider("portrait", callIndex),
    }));
  }

  async extractChapter(input: ChapterInput): Promise<ChapterResult> {
    return this.execute("extractChapter", input, (callIndex) => ({
      chapters: [{
        name: "The Riverbank",
        prompt: "Illustrate Mole and Water Rat meeting beside a winding spring river beneath willow branches, with a small blue boat tied among reeds. Show their adult character designs clearly, preserve their clothing and proportions, and compose one expansive watercolor storybook scene with textured paper, expressive daylight, rich natural detail, and no lettering or panels.",
        characterNames: input.characters.map(({ name }) => name),
      }],
      provider: textProvider("chapter", callIndex),
    }));
  }

  async generateIllustration(input: IllustrationInput): Promise<IllustrationResult> {
    return this.execute("generateIllustration", input, (callIndex) => ({
      image: VALID_PNG_FIXTURE,
      provider: imageProvider("illustration", callIndex),
    }));
  }
}
