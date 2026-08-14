declare const textInteractionIdBrand: unique symbol;
declare const imageInteractionIdBrand: unique symbol;

export type TextInteractionId = string & {
  readonly [textInteractionIdBrand]: "TextInteractionId";
};

export type ImageInteractionId = string & {
  readonly [imageInteractionIdBrand]: "ImageInteractionId";
};

function nonEmptyProviderId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

export function textInteractionId(value: string): TextInteractionId {
  return nonEmptyProviderId(value, "Text interaction ID") as TextInteractionId;
}

export function imageInteractionId(value: string): ImageInteractionId {
  return nonEmptyProviderId(value, "Image interaction ID") as ImageInteractionId;
}

export type ProviderFileReference = {
  providerFileName: string;
  uri: string;
  expiresAt?: string;
};

export type ProviderMetadata = {
  modelId: string;
  requestId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type TextProviderMetadata = ProviderMetadata & {
  interactionId: TextInteractionId;
};

export type ImageProviderMetadata = ProviderMetadata & {
  interactionId: ImageInteractionId;
};

export type UploadSourceInput = {
  projectId: string;
  originalName: string;
  bytes: Uint8Array;
  mimeType: "text/plain";
};

export type UploadSourceResult = {
  file: ProviderFileReference;
  provider: ProviderMetadata;
};

export type CreateBookContextInput = {
  projectId: string;
  source: ProviderFileReference;
};

export type BookContextResult = {
  provider: TextProviderMetadata;
};

export type StyleInput = {
  previousInteractionId: TextInteractionId;
  artDirection?: string;
};

export type StyleResult = {
  style: string;
  provider: TextProviderMetadata;
};

export type GatewayCharacter = {
  name: string;
  role: string;
  ageGroup: "adult";
  prompt: string;
};

export type CharactersInput = {
  previousInteractionId: TextInteractionId;
  style: string;
};

export type CharactersResult = {
  characters: GatewayCharacter[];
  provider: TextProviderMetadata;
};

export type CreateImageContextInput = {
  style: string;
};

export type ImageContextResult = {
  provider: ImageProviderMetadata;
};

export type PortraitInput = {
  characterId: string;
  character: GatewayCharacter;
  style: string;
  previousImageInteractionId: ImageInteractionId;
};

export type GatewayImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

export type PortraitResult = {
  characterId: string;
  image: GatewayImage;
  provider: ImageProviderMetadata;
};

export type GatewayChapter = {
  name: string;
  prompt: string;
  characterNames: string[];
};

export type ChapterInput = {
  previousInteractionId: TextInteractionId;
  style: string;
  characters: GatewayCharacter[];
};

export type ChapterResult = {
  chapters: GatewayChapter[];
  provider: TextProviderMetadata;
};

export type PortraitReference = {
  characterId: string;
  characterName: string;
  image: GatewayImage;
};

export type IllustrationInput = {
  style: string;
  chapter: GatewayChapter;
  portraitReferences: PortraitReference[];
};

export type IllustrationResult = {
  image: GatewayImage;
  provider: ImageProviderMetadata;
};

export interface GeminiGateway {
  uploadSource(input: UploadSourceInput): Promise<UploadSourceResult>;
  createBookContext(input: CreateBookContextInput): Promise<BookContextResult>;
  defineStyle(input: StyleInput): Promise<StyleResult>;
  extractCharacters(input: CharactersInput): Promise<CharactersResult>;
  createImageContext(input: CreateImageContextInput): Promise<ImageContextResult>;
  generatePortrait(input: PortraitInput): Promise<PortraitResult>;
  extractChapter(input: ChapterInput): Promise<ChapterResult>;
  generateIllustration(input: IllustrationInput): Promise<IllustrationResult>;
}

export class GeminiGatewayError extends Error {
  constructor(
    readonly code:
      | "MODEL_ACCESS_DENIED"
      | "QUOTA_EXCEEDED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_TIMEOUT_AMBIGUOUS"
      | "SAFETY_BLOCKED"
      | "NO_IMAGE"
      | "UNSUPPORTED_IMAGE_TYPE"
      | "INVALID_MODEL_OUTPUT"
      | "CONTEXT_EXPIRED",
    message: string,
    readonly httpStatus = 503,
  ) {
    super(message);
    this.name = "GeminiGatewayError";
  }
}

export class GeminiNotConfiguredError extends Error {
  readonly code = "GEMINI_NOT_CONFIGURED";

  constructor() {
    super("Gemini is not configured. Set the backend-only GEMINI_API_KEY to enable generation.");
    this.name = "GeminiNotConfiguredError";
  }
}

export class UnconfiguredGeminiGateway implements GeminiGateway {
  private unavailable(): never {
    throw new GeminiNotConfiguredError();
  }

  async uploadSource(): Promise<UploadSourceResult> { return this.unavailable(); }
  async createBookContext(): Promise<BookContextResult> { return this.unavailable(); }
  async defineStyle(): Promise<StyleResult> { return this.unavailable(); }
  async extractCharacters(): Promise<CharactersResult> { return this.unavailable(); }
  async createImageContext(): Promise<ImageContextResult> { return this.unavailable(); }
  async generatePortrait(): Promise<PortraitResult> { return this.unavailable(); }
  async extractChapter(): Promise<ChapterResult> { return this.unavailable(); }
  async generateIllustration(): Promise<IllustrationResult> { return this.unavailable(); }
}
