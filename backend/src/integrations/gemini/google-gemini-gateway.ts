import {
  BOOK_CONTEXT_PROMPT,
  CHAPTER_PROMPT,
  CHARACTERS_PROMPT,
  ILLUSTRATION_PROMPT,
  IMAGE_CONTEXT_PROMPT,
  PORTRAIT_PROMPT,
  STYLE_PROMPT,
} from "../../pipeline/prompts.js";
import {
  GeminiGatewayError,
  imageInteractionId,
  textInteractionId,
  type BookContextResult,
  type ChapterInput,
  type ChapterResult,
  type CharactersInput,
  type CharactersResult,
  type CreateBookContextInput,
  type CreateImageContextInput,
  type GeminiGateway,
  type GatewayImage,
  type IllustrationInput,
  type IllustrationResult,
  type ImageContextResult,
  type PortraitInput,
  type PortraitResult,
  type ProviderMetadata,
  type StyleInput,
  type StyleResult,
  type UploadSourceInput,
  type UploadSourceResult,
} from "./gateway.js";

type FetchImplementation = typeof fetch;

export type GoogleGeminiGatewayOptions = {
  apiKey: string;
  textModel: string;
  imageModel: string;
  timeoutMs: number;
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
};

type JsonRecord = Record<string, unknown>;

type InteractionResponse = {
  body: JsonRecord;
  requestId?: string;
};

const TEXT_RESPONSE_FORMAT = {
  type: "text",
  mime_type: "text/plain",
} as const;

const STRUCTURED_RESPONSE_FORMAT = (schema: unknown) => ({
  type: "text",
  mime_type: "application/json",
  schema,
});

const PORTRAIT_RESPONSE_FORMAT = {
  type: "image",
  mime_type: "image/jpeg",
  aspect_ratio: "3:4",
  image_size: "1K",
  delivery: "inline",
} as const;

const ILLUSTRATION_RESPONSE_FORMAT = {
  type: "image",
  mime_type: "image/jpeg",
  aspect_ratio: "4:3",
  image_size: "1K",
  delivery: "inline",
} as const;

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length ? normalized : undefined;
}

function safeUsage(body: JsonRecord): ProviderMetadata["usage"] {
  const usage = record(body.usage) ?? record(body.usage_metadata);
  if (!usage) return undefined;
  const number = (key: string): number | undefined => {
    const value = usage[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : undefined;
  };
  const inputTokens = number("total_input_tokens")
    ?? number("input_tokens")
    ?? number("prompt_token_count");
  const outputTokens = number("total_output_tokens")
    ?? number("output_tokens")
    ?? number("candidates_token_count");
  const totalTokens = number("total_tokens") ?? number("total_token_count");
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

function responseContent(body: JsonRecord): JsonRecord[] {
  const content: JsonRecord[] = [];
  const add = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    const item = record(value);
    if (!item) return;
    if (Array.isArray(item.content)) add(item.content);
    if (Array.isArray(item.outputs)) add(item.outputs);
    if (Array.isArray(item.output)) add(item.output);
    if (
      item.type === "text"
      || item.type === "image"
      || typeof item.text === "string"
      || typeof item.data === "string"
      || item.inline_data !== undefined
      || item.inlineData !== undefined
    ) content.push(item);
  };

  if (Array.isArray(body.steps)) {
    for (const step of [...body.steps].reverse()) {
      const stepRecord = record(step);
      if (stepRecord?.type === "model_output" || stepRecord?.role === "model") add(stepRecord.content);
    }
  }
  add(body.outputs);
  add(body.output);
  return content;
}

function textOutput(body: JsonRecord): string {
  const texts = responseContent(body)
    .map((item) => nonEmptyString(item.text))
    .filter((value): value is string => value !== undefined);
  if (texts.length === 0) {
    throw new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini returned no usable text output.", 502);
  }
  return texts.join("\n");
}

function jsonOutput(body: JsonRecord): unknown {
  const text = textOutput(body);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini returned malformed structured output.", 502);
  }
}

function strictBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/gu, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)) {
    throw new GeminiGatewayError("NO_IMAGE", "Gemini returned malformed image data.", 502);
  }
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.byteLength === 0 || decoded.toString("base64").replace(/=+$/u, "") !== normalized.replace(/=+$/u, "")) {
    throw new GeminiGatewayError("NO_IMAGE", "Gemini returned malformed image data.", 502);
  }
  return Uint8Array.from(decoded);
}

function imageOutput(body: JsonRecord): GatewayImage {
  const images = responseContent(body).flatMap((item): GatewayImage[] => {
    const inline = record(item.inline_data) ?? record(item.inlineData);
    const mime = nonEmptyString(item.mime_type)
      ?? nonEmptyString(item.mimeType)
      ?? nonEmptyString(inline?.mime_type)
      ?? nonEmptyString(inline?.mimeType);
    const data = nonEmptyString(item.data) ?? nonEmptyString(inline?.data);
    if (!data) return [];
    if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") {
      throw new GeminiGatewayError("UNSUPPORTED_IMAGE_TYPE", "Gemini returned an unsupported image type.", 502);
    }
    return [{ bytes: strictBase64(data), mimeType: mime }];
  });
  if (images.length === 0) {
    throw new GeminiGatewayError("NO_IMAGE", "Gemini returned no image.", 502);
  }
  if (images.length !== 1) {
    throw new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini returned an unexpected number of images.", 502);
  }
  return images[0]!;
}

function providerMetadata(
  response: InteractionResponse,
  configuredModel: string,
): ProviderMetadata {
  return {
    modelId: nonEmptyString(response.body.model) ?? configuredModel,
    ...(response.requestId ? { requestId: response.requestId } : {}),
    ...(safeUsage(response.body) ? { usage: safeUsage(response.body) } : {}),
  };
}

function interactionIdFrom(body: JsonRecord): string {
  const id = nonEmptyString(body.id) ?? nonEmptyString(body.name);
  if (!id) {
    throw new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini returned no interaction identifier.", 502);
  }
  return id;
}

function responseSignalsSafetyBlock(body: JsonRecord): boolean {
  const status = nonEmptyString(body.status)?.toLocaleLowerCase("en");
  const error = record(body.error);
  const code = nonEmptyString(error?.code)?.toLocaleLowerCase("en");
  const reason = nonEmptyString(error?.reason)?.toLocaleLowerCase("en");
  const serialized = JSON.stringify(body).toLocaleLowerCase("en");
  return (status === "failed" || status === "blocked")
    && (
      [code, reason].some((value) => value?.includes("safety"))
      || serialized.includes("safety")
    );
}

function requestIdFrom(response: Response): string | undefined {
  return response.headers.get("x-request-id")
    ?? response.headers.get("x-goog-request-id")
    ?? undefined;
}

function safeUploadName(originalName: string): string {
  const normalized = originalName.normalize("NFKC").replace(/[^0-9A-Za-z._-]+/gu, "-");
  return normalized.slice(0, 100) || "book.txt";
}

export class GoogleGeminiGateway implements GeminiGateway {
  private readonly baseUrl: string;
  private readonly fetchImplementation: FetchImplementation;

  constructor(private readonly options: GoogleGeminiGatewayOptions) {
    if (!options.apiKey.trim()) throw new Error("GoogleGeminiGateway requires an API key");
    this.baseUrl = (options.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/+$/u, "");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async uploadSource(input: UploadSourceInput): Promise<UploadSourceResult> {
    const initiation = await this.request(
      `${this.baseUrl}/upload/v1beta/files`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(input.bytes.byteLength),
          "X-Goog-Upload-Header-Content-Type": input.mimeType,
        },
        body: JSON.stringify({ file: { display_name: safeUploadName(input.originalName) } }),
      },
    );
    const uploadUrl = initiation.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini returned no resumable upload URL.", 502);
    }

    const finalized = await this.request(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(input.bytes.byteLength),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: Buffer.from(input.bytes),
    });
    const body = await this.readJson(finalized);
    const file = record(body.file) ?? body;
    const providerFileName = nonEmptyString(file.name);
    const uri = nonEmptyString(file.uri);
    if (!providerFileName || !uri) {
      throw new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini returned an invalid file reference.", 502);
    }
    return {
      file: {
        providerFileName,
        uri,
        ...(nonEmptyString(file.expirationTime) || nonEmptyString(file.expiration_time)
          ? { expiresAt: nonEmptyString(file.expirationTime) ?? nonEmptyString(file.expiration_time)! }
          : {}),
      },
      provider: {
        modelId: "gemini-files-api",
        ...(requestIdFrom(finalized) ? { requestId: requestIdFrom(finalized) } : {}),
      },
    };
  }

  async createBookContext(input: CreateBookContextInput): Promise<BookContextResult> {
    const response = await this.interaction({
      model: this.options.textModel,
      system_instruction: BOOK_CONTEXT_PROMPT.systemInstruction,
      input: [
        { type: "text", text: BOOK_CONTEXT_PROMPT.text },
        { type: "document", uri: input.source.uri },
      ],
      response_format: TEXT_RESPONSE_FORMAT,
    });
    const id = interactionIdFrom(response.body);
    return {
      provider: {
        ...providerMetadata(response, this.options.textModel),
        interactionId: textInteractionId(id),
      },
    };
  }

  async defineStyle(input: StyleInput): Promise<StyleResult> {
    const response = await this.interaction({
      model: this.options.textModel,
      previous_interaction_id: input.previousInteractionId,
      system_instruction: STYLE_PROMPT.systemInstruction,
      input: [{ type: "text", text: STYLE_PROMPT.text }],
      response_format: TEXT_RESPONSE_FORMAT,
    });
    const id = interactionIdFrom(response.body);
    return {
      style: textOutput(response.body),
      provider: {
        ...providerMetadata(response, this.options.textModel),
        interactionId: textInteractionId(id),
      },
    };
  }

  async extractCharacters(input: CharactersInput): Promise<CharactersResult> {
    const response = await this.interaction({
      model: this.options.textModel,
      previous_interaction_id: input.previousInteractionId,
      system_instruction: CHARACTERS_PROMPT.systemInstruction,
      input: [{ type: "text", text: `${CHARACTERS_PROMPT.text}\n\nArt direction:\n${input.style}` }],
      response_format: STRUCTURED_RESPONSE_FORMAT(CHARACTERS_PROMPT.jsonSchema),
    });
    const structured = record(jsonOutput(response.body));
    const id = interactionIdFrom(response.body);
    return {
      characters: (structured?.characters ?? []) as CharactersResult["characters"],
      provider: {
        ...providerMetadata(response, this.options.textModel),
        interactionId: textInteractionId(id),
      },
    };
  }

  async createImageContext(input: CreateImageContextInput): Promise<ImageContextResult> {
    const response = await this.interaction({
      model: this.options.imageModel,
      input: [{
        type: "text",
        text: `${IMAGE_CONTEXT_PROMPT.text}\n\nArt direction:\n${input.style}\n\nAcknowledge this style context briefly in text only.`,
      }],
      response_format: TEXT_RESPONSE_FORMAT,
    });
    const id = interactionIdFrom(response.body);
    textOutput(response.body);
    return {
      provider: {
        ...providerMetadata(response, this.options.imageModel),
        interactionId: imageInteractionId(id),
      },
    };
  }

  async generatePortrait(input: PortraitInput): Promise<PortraitResult> {
    const response = await this.interaction({
      model: this.options.imageModel,
      previous_interaction_id: input.previousImageInteractionId,
      system_instruction: PORTRAIT_PROMPT.systemInstruction,
      input: [{
        type: "text",
        text: [
          `Character ID: ${input.characterId}`,
          `Character name: ${input.character.name}`,
          `Narrative role: ${input.character.role}`,
          `Adult portrait brief: ${input.character.prompt}`,
          `Art direction: ${input.style}`,
          PORTRAIT_PROMPT.userConstraint,
        ].join("\n"),
      }],
      response_format: PORTRAIT_RESPONSE_FORMAT,
    });
    const id = interactionIdFrom(response.body);
    return {
      characterId: input.characterId,
      image: imageOutput(response.body),
      provider: {
        ...providerMetadata(response, this.options.imageModel),
        interactionId: imageInteractionId(id),
      },
    };
  }

  async extractChapter(input: ChapterInput): Promise<ChapterResult> {
    const cast = input.characters.map(({ name, role }) => ({ name, role }));
    const response = await this.interaction({
      model: this.options.textModel,
      previous_interaction_id: input.previousInteractionId,
      system_instruction: CHAPTER_PROMPT.systemInstruction,
      input: [{
        type: "text",
        text: `${CHAPTER_PROMPT.text}\n\nArt direction:\n${input.style}\n\nPersisted cast:\n${JSON.stringify(cast)}`,
      }],
      response_format: STRUCTURED_RESPONSE_FORMAT(CHAPTER_PROMPT.jsonSchema),
    });
    const structured = record(jsonOutput(response.body));
    const id = interactionIdFrom(response.body);
    return {
      chapters: (structured?.chapters ?? []) as ChapterResult["chapters"],
      provider: {
        ...providerMetadata(response, this.options.textModel),
        interactionId: textInteractionId(id),
      },
    };
  }

  async generateIllustration(input: IllustrationInput): Promise<IllustrationResult> {
    const portraitParts = input.portraitReferences.flatMap((reference) => ([
      {
        type: "text",
        text: `Portrait reference — character ID ${reference.characterId}; character name ${reference.characterName}.`,
      },
      {
        type: "image",
        mime_type: reference.image.mimeType,
        data: Buffer.from(reference.image.bytes).toString("base64"),
      },
    ]));
    const response = await this.interaction({
      model: this.options.imageModel,
      system_instruction: ILLUSTRATION_PROMPT.systemInstruction,
      input: [
        {
          type: "text",
          text: [
            `Chapter: ${input.chapter.name}`,
            `Scene brief: ${input.chapter.prompt}`,
            `Art direction: ${input.style}`,
            `Visible persisted cast: ${input.chapter.characterNames.join(", ")}`,
            "Use only the explicitly attached portrait references to preserve character appearance.",
            ILLUSTRATION_PROMPT.userConstraint,
          ].join("\n"),
        },
        ...portraitParts,
      ],
      response_format: ILLUSTRATION_RESPONSE_FORMAT,
    });
    const id = interactionIdFrom(response.body);
    return {
      image: imageOutput(response.body),
      provider: {
        ...providerMetadata(response, this.options.imageModel),
        interactionId: imageInteractionId(id),
      },
    };
  }

  private async interaction(body: JsonRecord): Promise<InteractionResponse> {
    const response = await this.request(
      `${this.baseUrl}/v1beta/interactions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          service_tier: "standard",
          store: true,
        }),
      },
    );
    const responseBody = await this.readJson(response);
    if (responseSignalsSafetyBlock(responseBody)) {
      throw new GeminiGatewayError("SAFETY_BLOCKED", "Gemini blocked the request for safety reasons.", 422);
    }
    return { body: responseBody, requestId: requestIdFrom(response) };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.fetchImplementation(url, {
        ...init,
        headers: {
          "x-goog-api-key": this.options.apiKey,
          ...init.headers,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw await this.httpFailure(response);
      return response;
    } catch (error) {
      if (error instanceof GeminiGatewayError) throw error;
      if (controller.signal.aborted) {
        throw new GeminiGatewayError(
          "PROVIDER_TIMEOUT_AMBIGUOUS",
          "Gemini did not respond before the configured timeout; upstream completion is unknown.",
          504,
        );
      }
      throw new GeminiGatewayError("PROVIDER_UNAVAILABLE", "Gemini could not be reached.", 503);
    } finally {
      clearTimeout(timer);
    }
  }

  private async httpFailure(response: Response): Promise<GeminiGatewayError> {
    const status = response.status;
    if (status === 400 || status === 422) {
      try {
        const body = record(await response.json());
        if (body && responseSignalsSafetyBlock({ ...body, status: "failed" })) {
          return new GeminiGatewayError("SAFETY_BLOCKED", "Gemini blocked the request for safety reasons.", 422);
        }
      } catch {
        // Upstream bodies are never exposed; status mapping remains authoritative.
      }
    }
    if (status === 401 || status === 403) {
      return new GeminiGatewayError("MODEL_ACCESS_DENIED", "Gemini access was denied for the selected model.", 502);
    }
    if (status === 429) {
      return new GeminiGatewayError("QUOTA_EXCEEDED", "Gemini quota or rate limit was reached.", 429);
    }
    if (status === 404 || status === 410) {
      return new GeminiGatewayError("CONTEXT_EXPIRED", "The required Gemini context is missing or expired.", 409);
    }
    if (status >= 500) {
      return new GeminiGatewayError("PROVIDER_UNAVAILABLE", "Gemini is temporarily unavailable.", 503);
    }
    return new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini rejected the provider request.", 502);
  }

  private async readJson(response: Response): Promise<JsonRecord> {
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini returned a malformed response.", 502);
    }
    const body = record(value);
    if (!body) {
      throw new GeminiGatewayError("INVALID_MODEL_OUTPUT", "Gemini returned a malformed response.", 502);
    }
    return body;
  }
}
