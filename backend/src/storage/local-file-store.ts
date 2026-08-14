import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

export type CanonicalSource = {
  bytes: Uint8Array;
  text: string;
  byteCount: number;
  wordCount: number;
  sha256: string;
};

export type StoredSource = CanonicalSource & {
  relativePath: string;
};

export type WriteSourceInput = {
  userId: string;
  projectId: string;
  source: CanonicalSource;
};

export interface SourceFileStore {
  canonicalize(bytes: Uint8Array): CanonicalSource;
  validateUploadMetadata(originalName: string, mimeType: string): void;
  writeSource(input: WriteSourceInput): Promise<StoredSource>;
  readSource(relativePath: string): Promise<string>;
  removeProject(userId: string, projectId: string): Promise<void>;
}

export class SourceValidationError extends Error {
  constructor(
    message: string,
    readonly field = "source",
  ) {
    super(message);
    this.name = "SourceValidationError";
  }
}

function assertSafeSegment(value: string, label: string): void {
  if (!/^[0-9A-Za-z_-]+$/.test(value)) {
    throw new Error(`${label} is not a safe generated path segment`);
  }
}

export class LocalFileStore implements SourceFileStore {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly encoder = new TextEncoder();
  private readonly dataRoot: string;

  constructor(
    dataRoot: string,
    private readonly maximumSourceBytes: number,
  ) {
    this.dataRoot = resolve(dataRoot);
  }

  canonicalize(bytes: Uint8Array): CanonicalSource {
    if (bytes.byteLength > this.maximumSourceBytes) {
      throw new SourceValidationError(
        `Manuscript must not exceed ${this.maximumSourceBytes} bytes.`,
      );
    }

    let decoded: string;
    try {
      decoded = this.decoder.decode(bytes);
    } catch {
      throw new SourceValidationError("Manuscript must contain valid UTF-8 text.");
    }

    const text = decoded
      .replace(/^\uFEFF/u, "")
      .replace(/\r\n?/gu, "\n");

    if (text.includes("\0")) {
      throw new SourceValidationError("Manuscript must not contain NUL bytes.");
    }
    const hasUnsupportedControlByte = [...text].some((character) => {
      const code = character.charCodeAt(0);
      return (code >= 1 && code <= 8)
        || code === 11
        || code === 12
        || (code >= 14 && code <= 31)
        || code === 127;
    });
    if (hasUnsupportedControlByte) {
      throw new SourceValidationError("Manuscript contains unsupported binary control bytes.");
    }
    if (!text.trim()) {
      throw new SourceValidationError("Manuscript must not be blank.");
    }

    const canonicalBytes = this.encoder.encode(text);
    if (canonicalBytes.byteLength > this.maximumSourceBytes) {
      throw new SourceValidationError(
        `Manuscript must not exceed ${this.maximumSourceBytes} bytes.`,
      );
    }

    return {
      bytes: canonicalBytes,
      text,
      byteCount: canonicalBytes.byteLength,
      wordCount: text.trim().split(/\s+/u).length,
      sha256: createHash("sha256").update(canonicalBytes).digest("hex"),
    };
  }

  validateUploadMetadata(originalName: string, mimeType: string): void {
    if (!originalName || originalName.length > 255) {
      throw new SourceValidationError(
        "Upload filename must contain between 1 and 255 characters.",
        "file",
      );
    }
    if (extname(originalName).toLowerCase() !== ".txt") {
      throw new SourceValidationError("Upload must use a .txt filename.", "file");
    }

    const advisoryMime = mimeType.trim().toLowerCase().split(";", 1)[0];
    if (!["", "text/plain", "application/octet-stream"].includes(advisoryMime ?? "")) {
      throw new SourceValidationError("Upload MIME type must describe plain text.", "file");
    }
  }

  async writeSource({ userId, projectId, source }: WriteSourceInput): Promise<StoredSource> {
    assertSafeSegment(userId, "User ID");
    assertSafeSegment(projectId, "Project ID");

    const projectDirectory = this.resolveContained(
      "users",
      userId,
      "projects",
      projectId,
    );
    const sourceDirectory = resolve(projectDirectory, "source");
    const destination = resolve(sourceDirectory, "book.txt");
    const temporary = resolve(
      sourceDirectory,
      `.book.txt.${randomBytes(12).toString("hex")}.partial`,
    );

    try {
      await mkdir(dirname(projectDirectory), { recursive: true, mode: 0o700 });
      await mkdir(projectDirectory, { mode: 0o700 });
      await mkdir(sourceDirectory, { mode: 0o700 });
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(source.bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, destination);

      return {
        ...source,
        relativePath: relative(this.dataRoot, destination).split(sep).join("/"),
      };
    } catch (error) {
      await rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async readSource(relativePath: string): Promise<string> {
    const absolutePath = this.resolveStoredPath(relativePath);
    return this.decoder.decode(await readFile(absolutePath));
  }

  async removeProject(userId: string, projectId: string): Promise<void> {
    assertSafeSegment(userId, "User ID");
    assertSafeSegment(projectId, "Project ID");
    await rm(this.resolveContained("users", userId, "projects", projectId), {
      recursive: true,
      force: true,
    });
  }

  private resolveStoredPath(storedPath: string): string {
    if (!storedPath || storedPath.includes("\0")) {
      throw new Error("Stored source path is invalid");
    }
    return this.assertContained(resolve(this.dataRoot, storedPath));
  }

  private resolveContained(...segments: string[]): string {
    return this.assertContained(resolve(this.dataRoot, ...segments));
  }

  private assertContained(candidate: string): string {
    const relation = relative(this.dataRoot, candidate);
    if (
      relation === ""
      || relation === ".."
      || relation.startsWith(`..${sep}`)
      || isAbsolute(relation)
    ) {
      throw new Error("Resolved source path escapes the private data directory");
    }
    return candidate;
  }
}
