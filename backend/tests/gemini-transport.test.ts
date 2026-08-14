import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { GoogleGeminiGateway } from "../src/integrations/gemini/google-gemini-gateway.js";
import { textInteractionId } from "../src/integrations/gemini/gateway.js";
import {
  BOOK_CONTEXT_PROMPT,
  IMAGE_CONTEXT_PROMPT,
  ILLUSTRATION_PROMPT,
  PORTRAIT_PROMPT,
} from "../src/pipeline/prompts.js";
import { claimStep } from "../src/pipeline/pipeline-service.js";
import {
  beginProviderOperation,
  completeProviderOperation,
} from "../src/pipeline/provider-operations.js";
import { createPasteProject, signIn } from "./helpers/api.js";
import { VALID_PNG_FIXTURE } from "./helpers/fakes.js";
import { createTestHarness } from "./helpers/harness.js";

const VALID_JPEG_FIXTURE = {
  mimeType: "image/jpeg" as const,
  bytes: Uint8Array.from(Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
    "base64",
  )),
};

type CapturedRequest = {
  url: string;
  method: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
};

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    if (server.listening) {
      server.close();
      await once(server, "close");
    }
  }));
});

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function localServer(
  handler: (
    request: CapturedRequest,
    response: ServerResponse,
  ) => void | Promise<void>,
): Promise<{ baseUrl: string; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];
  const server = createServer(async (request, response) => {
    const captured = {
      url: request.url ?? "",
      method: request.method ?? "",
      headers: request.headers,
      body: await readBody(request),
    };
    requests.push(captured);
    await handler(captured, response);
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

function adapter(baseUrl: string): GoogleGeminiGateway {
  return new GoogleGeminiGateway({
    apiKey: "test-backend-only-key",
    textModel: "configured-text-model",
    imageModel: "configured-image-model",
    timeoutMs: 2_000,
    baseUrl,
  });
}

function sendJson(response: ServerResponse, body: unknown, status = 200): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function textInteraction(id: string, text: string) {
  return {
    id,
    model: "provider-selected-text-model",
    usage: { total_input_tokens: 10, total_output_tokens: 4, total_tokens: 14 },
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
  };
}

function imageInteraction(id: string) {
  return {
    id,
    model: "provider-selected-image-model",
    steps: [{
      type: "model_output",
      content: [{
        type: "image",
        mime_type: "image/jpeg",
        data: Buffer.from(VALID_JPEG_FIXTURE.bytes).toString("base64"),
      }],
    }],
  };
}

describe("Google Gemini native transport", () => {
  it("turns one HTTP 429 into one typed failure without retry or fallback", async () => {
    const local = await localServer((_request, response) => {
      sendJson(response, { error: { message: "upstream body must not escape" } }, 429);
    });

    const gateway = adapter(local.baseUrl);
    await expect(gateway.defineStyle({
      previousInteractionId: textInteractionId("previous-text-interaction"),
    })).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      message: "Gemini quota or rate limit was reached.",
    });

    expect(local.requests).toHaveLength(1);
    expect(local.requests[0]).toMatchObject({
      method: "POST",
      url: "/v1beta/interactions",
    });
    const body = JSON.parse(local.requests[0]!.body.toString("utf8"));
    expect(body).toMatchObject({
      model: "configured-text-model",
      previous_interaction_id: "previous-text-interaction",
      service_tier: "standard",
      store: true,
    });
    expect(JSON.stringify(body)).not.toContain("configured-image-model");
  });

  it("constructs the notebook-compatible book context without resending manuscript bytes", async () => {
    const local = await localServer((request, response) => {
      if (request.url === "/upload/v1beta/files") {
        response.statusCode = 200;
        response.setHeader("x-goog-upload-url", `${local.baseUrl}/book-upload-session`);
        response.end();
        return;
      }
      if (request.url === "/book-upload-session") {
        sendJson(response, {
          file: {
            name: "files/source-name",
            uri: "https://provider.invalid/files/source-name",
          },
        });
        return;
      }
      sendJson(response, textInteraction("book-terminal", "Book context established."));
    });
    const gateway = adapter(local.baseUrl);
    const manuscriptBody = "This manuscript body must never appear in the interaction request.";
    const upload = await gateway.uploadSource({
      projectId: "project-id",
      originalName: "book.txt",
      bytes: new TextEncoder().encode(manuscriptBody),
      mimeType: "text/plain",
    });

    const result = await gateway.createBookContext({
      projectId: "project-id",
      source: upload.file,
    });

    expect(result.provider).toMatchObject({
      interactionId: "book-terminal",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });
    expect(local.requests).toHaveLength(3);
    expect(local.requests[1]!.body.toString("utf8")).toBe(manuscriptBody);
    const body = JSON.parse(local.requests[2]!.body.toString("utf8"));
    expect(body).toEqual({
      model: "configured-text-model",
      system_instruction: BOOK_CONTEXT_PROMPT.systemInstruction,
      input: [
        { type: "text", text: BOOK_CONTEXT_PROMPT.text },
        { type: "document", uri: "https://provider.invalid/files/source-name" },
      ],
      response_format: { type: "text", mime_type: "text/plain" },
      service_tier: "standard",
      store: true,
    });
    expect(body.input[1]).not.toHaveProperty("mime_type");
    expect(JSON.stringify(body)).not.toContain(manuscriptBody);
  });

  it("parses current usage totals and persists all three safe token counts", async () => {
    const local = await localServer((_request, response) => {
      sendJson(response, textInteraction("style-with-usage", "Watercolour style."));
    });
    const gateway = adapter(local.baseUrl);
    const harness = await createTestHarness();

    try {
      const style = await gateway.defineStyle({
        previousInteractionId: textInteractionId("book-terminal"),
      });
      expect(style.provider.usage).toEqual({
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
      });

      const session = await signIn(harness);
      const userId = session.response.json().user.id as string;
      const project = await createPasteProject(harness, session.cookie);
      const projectId = project.json().id as string;
      const claim = claimStep(harness.dependencies, userId, projectId, 1);
      expect(claim.kind).toBe("claimed");
      if (claim.kind !== "claimed") throw new Error("Expected a claimed attempt");
      const attempt = { projectId, ordinal: 1 as const, attemptId: claim.attemptId };
      const operationId = beginProviderOperation(harness.dependencies, attempt, {
        operationKey: "usage-transport",
        modelId: "configured-text-model",
        promptVersion: "usage-transport.v1",
      });
      completeProviderOperation(
        harness.dependencies,
        attempt,
        operationId,
        style.provider,
        () => undefined,
      );

      const row = harness.database.prepare(`
        SELECT model_id, usage_json FROM provider_operations WHERE id = ?
      `).get(operationId) as { model_id: string; usage_json: string };
      expect(row.model_id).toBe("provider-selected-text-model");
      expect(JSON.parse(row.usage_json)).toEqual({
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
      });
      expect(local.requests).toHaveLength(1);
    } finally {
      await harness.cleanup();
    }
  });

  it("constructs chained structured text and fresh explicit-reference image requests", async () => {
    let index = 0;
    const local = await localServer((_request, response) => {
      index += 1;
      if (index === 1) {
        sendJson(response, textInteraction("characters-terminal", JSON.stringify({ characters: [] })));
      } else {
        sendJson(response, imageInteraction("illustration-terminal"));
      }
    });
    const gateway = adapter(local.baseUrl);

    const characters = await gateway.extractCharacters({
      previousInteractionId: textInteractionId("style-terminal"),
      style: "Watercolour art direction",
    });
    expect(characters.provider).toMatchObject({
      interactionId: "characters-terminal",
      modelId: "provider-selected-text-model",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });

    const illustration = await gateway.generateIllustration({
      style: "Watercolour art direction",
      chapter: {
        name: "Riverbank",
        prompt: "A detailed single scene prompt.",
        characterNames: ["Mole"],
      },
      portraitReferences: [{
        characterId: "character-mole",
        characterName: "Mole",
        image: VALID_PNG_FIXTURE,
      }],
    });
    expect(illustration.provider).toMatchObject({
      interactionId: "illustration-terminal",
      modelId: "provider-selected-image-model",
    });

    expect(local.requests).toHaveLength(2);
    const characterBody = JSON.parse(local.requests[0]!.body.toString("utf8"));
    expect(characterBody).toMatchObject({
      model: "configured-text-model",
      previous_interaction_id: "style-terminal",
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: { type: "object" },
      },
      service_tier: "standard",
    });

    const illustrationBody = JSON.parse(local.requests[1]!.body.toString("utf8"));
    expect(illustrationBody).toEqual({
      model: "configured-image-model",
      system_instruction: ILLUSTRATION_PROMPT.systemInstruction,
      input: [
        {
          type: "text",
          text: [
            "Chapter: Riverbank",
            "Scene brief: A detailed single scene prompt.",
            "Art direction: Watercolour art direction",
            "Visible persisted cast: Mole",
            "Use only the explicitly attached portrait references to preserve character appearance.",
            ILLUSTRATION_PROMPT.userConstraint,
          ].join("\n"),
        },
        {
          type: "text",
          text: "Portrait reference — character ID character-mole; character name Mole.",
        },
        {
          type: "image",
          mime_type: "image/png",
          data: Buffer.from(VALID_PNG_FIXTURE.bytes).toString("base64"),
        },
      ],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "4:3",
        image_size: "1K",
        delivery: "inline",
      },
      service_tier: "standard",
      store: true,
    });
    expect(illustrationBody).not.toHaveProperty("previous_interaction_id");
    expect(illustrationBody.input.filter((part: { type: string }) => part.type === "image"))
      .toHaveLength(1);
    expect(illustrationBody.input).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("character ID character-mole; character name Mole"),
      }),
      expect.objectContaining({
        type: "image",
        mime_type: "image/png",
      }),
    ]));
    expect(illustrationBody.input[0].text).toContain(ILLUSTRATION_PROMPT.userConstraint);
    expect(illustrationBody.input[0].text).toContain("family-friendly");
    expect(illustrationBody.input[0].text).toContain("single image");
    expect(illustrationBody.input[0].text).toContain("no text");
    expect(illustrationBody.input[0].text).toContain("no title");
    expect(illustrationBody.input[0].text).toContain("no border");
    expect(illustrationBody.input[0].text).toContain("no caption");
    expect(illustrationBody.input[0].text).toContain("no multi-panel layout");
    expect(JSON.stringify(illustrationBody)).not.toContain("character-rat");
    expect(illustration.image).toEqual(VALID_JPEG_FIXTURE);
  });

  it("constructs image context and sequential JPEG portrait requests with direct constraints", async () => {
    let index = 0;
    const local = await localServer((_request, response) => {
      index += 1;
      if (index === 1) {
        sendJson(response, textInteraction("image-context-terminal", "Style context ready."));
      } else if (index === 2) {
        sendJson(response, imageInteraction("portrait-one-terminal"));
      } else {
        sendJson(response, imageInteraction("portrait-two-terminal"));
      }
    });
    const gateway = adapter(local.baseUrl);
    const style = "Watercolour and fine ink.";
    const character = {
      name: "Mole",
      role: "Adult lead",
      ageGroup: "adult" as const,
      prompt: "A detailed adult portrait brief used to verify transport construction.",
    };

    const context = await gateway.createImageContext({ style });
    const first = await gateway.generatePortrait({
      characterId: "character-mole",
      character,
      style,
      previousImageInteractionId: context.provider.interactionId,
    });
    const second = await gateway.generatePortrait({
      characterId: "character-rat",
      character: { ...character, name: "Water Rat", role: "Adult river guide" },
      style,
      previousImageInteractionId: first.provider.interactionId,
    });

    expect(context.provider.interactionId).toBe("image-context-terminal");
    expect(first.image).toEqual(VALID_JPEG_FIXTURE);
    expect(second.image).toEqual(VALID_JPEG_FIXTURE);
    expect(local.requests).toHaveLength(3);

    const contextBody = JSON.parse(local.requests[0]!.body.toString("utf8"));
    expect(contextBody).toEqual({
      model: "configured-image-model",
      input: [{
        type: "text",
        text: `${IMAGE_CONTEXT_PROMPT.text}\n\nArt direction:\n${style}\n\nAcknowledge this style context briefly in text only.`,
      }],
      response_format: { type: "text", mime_type: "text/plain" },
      service_tier: "standard",
      store: true,
    });
    expect(contextBody).not.toHaveProperty("previous_interaction_id");

    const portraitBodies = local.requests.slice(1).map(({ body }) => JSON.parse(body.toString("utf8")));
    expect(portraitBodies[0]).toEqual({
      model: "configured-image-model",
      previous_interaction_id: "image-context-terminal",
      system_instruction: PORTRAIT_PROMPT.systemInstruction,
      input: [{
        type: "text",
        text: [
          "Character ID: character-mole",
          "Character name: Mole",
          "Narrative role: Adult lead",
          `Adult portrait brief: ${character.prompt}`,
          `Art direction: ${style}`,
          PORTRAIT_PROMPT.userConstraint,
        ].join("\n"),
      }],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "3:4",
        image_size: "1K",
        delivery: "inline",
      },
      service_tier: "standard",
      store: true,
    });
    expect(portraitBodies[1]).toMatchObject({
      previous_interaction_id: "portrait-one-terminal",
      response_format: { type: "image", mime_type: "image/jpeg" },
    });
    for (const body of portraitBodies) {
      expect(body.input).toHaveLength(1);
      expect(body.input[0].text).toContain(PORTRAIT_PROMPT.userConstraint);
      expect(body.input[0].text).toContain("family-friendly");
      expect(body.input[0].text).toContain("single image");
      expect(body.input[0].text).toContain("no text");
      expect(body.input[0].text).toContain("no title");
      expect(body.input[0].text).toContain("no border");
      expect(body.input[0].text).toContain("no caption");
      expect(body.input[0].text).toContain("no multi-panel layout");
    }
  });

  it("uses the documented two-request resumable Files upload without retries", async () => {
    let uploadUrl = "";
    const local = await localServer((request, response) => {
      if (request.url === "/upload/v1beta/files") {
        uploadUrl = `${local.baseUrl}/upload-session`;
        response.statusCode = 200;
        response.setHeader("x-goog-upload-url", uploadUrl);
        response.end();
        return;
      }
      response.setHeader("x-goog-request-id", "file-request-id");
      sendJson(response, {
        file: {
          name: "files/provider-name",
          uri: "https://provider.invalid/files/provider-name",
          expirationTime: "2026-08-16T00:00:00.000Z",
        },
      });
    });
    const gateway = adapter(local.baseUrl);

    const result = await gateway.uploadSource({
      projectId: "project-id",
      originalName: "../../unsafe manuscript.txt",
      bytes: new TextEncoder().encode("manuscript"),
      mimeType: "text/plain",
    });

    expect(result).toMatchObject({
      file: {
        providerFileName: "files/provider-name",
        uri: "https://provider.invalid/files/provider-name",
        expiresAt: "2026-08-16T00:00:00.000Z",
      },
      provider: { modelId: "gemini-files-api", requestId: "file-request-id" },
    });
    expect(local.requests).toHaveLength(2);
    expect(local.requests[0]!.headers).toMatchObject({
      "x-goog-upload-protocol": "resumable",
      "x-goog-upload-command": "start",
      "x-goog-upload-header-content-type": "text/plain",
      "x-goog-api-key": "test-backend-only-key",
    });
    expect(JSON.parse(local.requests[0]!.body.toString("utf8"))).toEqual({
      file: { display_name: "..-..-unsafe-manuscript.txt" },
    });
    expect(local.requests[1]).toMatchObject({ url: "/upload-session", body: Buffer.from("manuscript") });
    expect(local.requests[1]!.headers).toMatchObject({
      "x-goog-upload-command": "upload, finalize",
      "x-goog-upload-offset": "0",
    });
    expect(uploadUrl).toBe(`${local.baseUrl}/upload-session`);
  });

  it("rejects malformed JSON, missing images, and multiple images with safe typed errors", async () => {
    let index = 0;
    const local = await localServer((_request, response) => {
      index += 1;
      if (index === 1) {
        sendJson(response, textInteraction("bad-json", "{not valid json"));
      } else if (index === 2) {
        sendJson(response, textInteraction("no-image", "I could not generate an image."));
      } else {
        const image = imageInteraction("multiple-images");
        const step = image.steps[0]!;
        step.content.push({ ...step.content[0]! });
        sendJson(response, image);
      }
    });
    const gateway = adapter(local.baseUrl);

    await expect(gateway.extractCharacters({
      previousInteractionId: textInteractionId("style-terminal"),
      style: "Style",
    })).rejects.toMatchObject({
      code: "INVALID_MODEL_OUTPUT",
      message: "Gemini returned malformed structured output.",
    });
    await expect(gateway.generateIllustration({
      style: "Style",
      chapter: {
        name: "Chapter",
        prompt: "Scene",
        characterNames: [],
      },
      portraitReferences: [],
    })).rejects.toMatchObject({
      code: "NO_IMAGE",
      message: "Gemini returned no image.",
    });
    await expect(gateway.generateIllustration({
      style: "Style",
      chapter: {
        name: "Chapter",
        prompt: "Scene",
        characterNames: [],
      },
      portraitReferences: [],
    })).rejects.toMatchObject({
      code: "INVALID_MODEL_OUTPUT",
      message: "Gemini returned an unexpected number of images.",
    });
    expect(local.requests).toHaveLength(3);
  });
});
