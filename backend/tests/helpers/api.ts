import type { LightMyRequestResponse } from "fastify";
import type { TestHarness } from "./harness.js";

export function cookieFrom(response: LightMyRequestResponse): string {
  const setCookie = response.headers["set-cookie"];
  if (typeof setCookie !== "string") throw new Error("Response did not set a cookie");
  return setCookie.split(";", 1)[0]!;
}

export function rawCookieToken(cookie: string): string {
  const separator = cookie.indexOf("=");
  if (separator < 0) throw new Error("Cookie does not contain a token");
  return decodeURIComponent(cookie.slice(separator + 1));
}

export async function signIn(
  harness: TestHarness,
  input: { name?: string; email?: string } = {},
): Promise<{ cookie: string; response: LightMyRequestResponse }> {
  const response = await harness.app.inject({
    method: "POST",
    url: "/api/session",
    payload: {
      name: input.name ?? "Assessment Reader",
      email: input.email ?? "reader@example.com",
    },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Sign-in failed with ${response.statusCode}: ${response.body}`);
  }
  return { cookie: cookieFrom(response), response };
}

export function multipartPayload(input: {
  fields: Record<string, string>;
  files?: Array<{
    fieldName?: string;
    filename: string;
    mimeType?: string;
    bytes: Uint8Array;
  }>;
}): { boundary: string; payload: Buffer } {
  const boundary = "gradion-folio-test-boundary";
  const parts: Buffer[] = [];
  const line = (value: string) => parts.push(Buffer.from(value, "utf8"));

  for (const [name, value] of Object.entries(input.fields)) {
    line(`--${boundary}\r\n`);
    line(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    line(`${value}\r\n`);
  }
  for (const file of input.files ?? []) {
    line(`--${boundary}\r\n`);
    line(`Content-Disposition: form-data; name="${file.fieldName ?? "file"}"; filename="${file.filename}"\r\n`);
    if (file.mimeType !== undefined) line(`Content-Type: ${file.mimeType}\r\n`);
    line("\r\n");
    parts.push(Buffer.from(file.bytes));
    line("\r\n");
  }
  line(`--${boundary}--\r\n`);

  return { boundary, payload: Buffer.concat(parts) };
}

export async function createUploadProject(
  harness: TestHarness,
  cookie: string,
  input: {
    title?: string;
    filename?: string;
    mimeType?: string;
    bytes?: Uint8Array;
    fields?: Record<string, string>;
    files?: Array<{
      filename: string;
      mimeType?: string;
      bytes: Uint8Array;
    }>;
  } = {},
): Promise<LightMyRequestResponse> {
  const multipart = multipartPayload({
    fields: input.fields ?? {
      title: input.title ?? "Uploaded volume",
      sourceMode: "upload",
    },
    files: input.files ?? [{
      filename: input.filename ?? "book.txt",
      mimeType: input.mimeType,
      bytes: input.bytes ?? new TextEncoder().encode("Uploaded manuscript text."),
    }],
  });
  return harness.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: {
      cookie,
      "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
    },
    payload: multipart.payload,
  });
}

export async function createPasteProject(
  harness: TestHarness,
  cookie: string,
  input: { title?: string; text?: string } = {},
): Promise<LightMyRequestResponse> {
  return harness.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie },
    payload: {
      title: input.title ?? "Pasted volume",
      sourceMode: "paste",
      text: input.text ?? "Canonical manuscript text.",
    },
  });
}
