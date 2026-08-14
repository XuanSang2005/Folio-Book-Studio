import { afterEach, describe, expect, it, vi } from "vitest";
import { projectFixture, sessionFixture } from "../../test/fixtures";
import {
  ApiError,
  createPasteProject,
  createUploadProject,
  getSession,
} from "./client";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiClient", () => {
  it("parses a successful response and always sends same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionFixture));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSession()).resolves.toEqual(sessionFixture);
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({
      method: "GET",
      credentials: "same-origin",
    }));
  });

  it("exposes typed API errors and server field errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        fieldErrors: { title: ["Give this volume a title."] },
      },
    }, 400)));

    const error = await createPasteProject({ title: "", sourceMode: "paste", text: "Text" })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fieldErrors: { title: ["Give this volume a title."] },
    });
  });

  it("sends the exact paste project JSON payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(projectFixture(), 201));
    vi.stubGlobal("fetch", fetchMock);
    const input = { title: "Pasted volume", sourceMode: "paste" as const, text: "Exact manuscript" };

    await createPasteProject(input);

    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }));
  });

  it("preserves the actual File in multipart upload without setting Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(projectFixture({
      source: { mode: "upload", originalName: "volume.txt", byteCount: 10, wordCount: 2 },
    }), 201));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["Exact text"], "volume.txt", { type: "text/plain" });

    await createUploadProject({ title: "Upload volume", sourceMode: "upload", file });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("title")).toBe("Upload volume");
    expect(form.get("sourceMode")).toBe("upload");
    expect(form.get("file")).toBe(file);
    expect([...form.keys()]).toEqual(["title", "sourceMode", "file"]);
  });
});
