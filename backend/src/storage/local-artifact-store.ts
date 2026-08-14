import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ApiErrorCode } from "@gradion-folio/contracts";
import type { GatewayImage } from "../integrations/gemini/gateway.js";

export type SupportedImageMime = GatewayImage["mimeType"];

export type StoredArtifact = {
  relativePath: string;
  mimeType: SupportedImageMime;
  byteCount: number;
  sha256: string;
};

export type StoredArtifactExpectation = {
  mimeType: string;
  byteCount: number;
  sha256: string;
};

export class ArtifactStorageError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArtifactStorageError";
  }
}

export interface ArtifactFileStore {
  writeImage(input: {
    userId: string;
    projectId: string;
    kind: "portraits" | "illustrations";
    itemId: string;
    attemptId: string;
    image: GatewayImage;
  }): Promise<StoredArtifact>;
  readImage(
    relativePath: string,
    expected: StoredArtifactExpectation,
  ): Promise<GatewayImage>;
  remove(relativePath: string): Promise<void>;
}

function assertSafeSegment(value: string, label: string): void {
  if (!/^[0-9A-Za-z_-]+$/.test(value)) {
    throw new ArtifactStorageError("LOCAL_IO_ERROR", `${label} is not a safe generated path segment.`);
  }
}

function structurallyValidJpeg(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength < 12
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
    || bytes.at(-2) !== 0xff
    || bytes.at(-1) !== 0xd9
  ) return false;

  let offset = 2;
  let hasStartOfFrame = false;
  while (offset < bytes.byteLength - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength - 2) return false;
    const segmentLength = Buffer.from(bytes.subarray(offset, offset + 2)).readUInt16BE(0);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength - 2) return false;
    if (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    ) hasStartOfFrame = true;
    if (marker === 0xda) return hasStartOfFrame;
    offset += segmentLength;
  }
  return false;
}

function structurallyValidWebp(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength < 26
    || Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== "RIFF"
    || Buffer.from(bytes.subarray(8, 12)).toString("ascii") !== "WEBP"
    || Buffer.from(bytes.subarray(4, 8)).readUInt32LE(0) + 8 !== bytes.byteLength
  ) return false;

  let offset = 12;
  let hasImageChunk = false;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) return false;
    const kind = Buffer.from(bytes.subarray(offset, offset + 4)).toString("ascii");
    const size = Buffer.from(bytes.subarray(offset + 4, offset + 8)).readUInt32LE(0);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + size;
    if (payloadEnd > bytes.byteLength) return false;
    if (
      (kind === "VP8 " && size >= 10)
      || (kind === "VP8L" && size >= 5)
      || (kind === "VP8X" && size >= 10)
    ) hasImageChunk = true;
    offset = payloadEnd + (size % 2);
  }
  return offset === bytes.byteLength && hasImageChunk;
}

function detectedMime(bytes: Uint8Array): SupportedImageMime | null {
  if (
    bytes.byteLength >= 45
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
    && Buffer.from(bytes.subarray(8, 12)).readUInt32BE(0) === 13
    && Buffer.from(bytes.subarray(12, 16)).toString("ascii") === "IHDR"
    && Buffer.from(bytes.subarray(bytes.byteLength - 12, bytes.byteLength - 8)).readUInt32BE(0) === 0
    && Buffer.from(bytes.subarray(bytes.byteLength - 8, bytes.byteLength - 4)).toString("ascii") === "IEND"
  ) return "image/png";

  if (structurallyValidJpeg(bytes)) return "image/jpeg";

  if (structurallyValidWebp(bytes)) return "image/webp";

  return null;
}

function extensionFor(mimeType: SupportedImageMime): string {
  switch (mimeType) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
  }
}

export function validateGatewayImage(
  image: GatewayImage,
  maximumBytes: number,
): StoredArtifactExpectation {
  if (!(image.bytes instanceof Uint8Array) || image.bytes.byteLength === 0) {
    throw new ArtifactStorageError("NO_IMAGE", "The provider returned no image data.");
  }
  if (image.bytes.byteLength > maximumBytes) {
    throw new ArtifactStorageError("INVALID_MODEL_OUTPUT", "The generated image exceeds the configured size limit.");
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(image.mimeType)) {
    throw new ArtifactStorageError("UNSUPPORTED_IMAGE_TYPE", "The provider returned an unsupported image type.");
  }
  const actualMime = detectedMime(image.bytes);
  if (!actualMime || actualMime !== image.mimeType) {
    throw new ArtifactStorageError(
      "UNSUPPORTED_IMAGE_TYPE",
      "The generated image MIME type does not match its bytes.",
    );
  }
  return {
    mimeType: actualMime,
    byteCount: image.bytes.byteLength,
    sha256: createHash("sha256").update(image.bytes).digest("hex"),
  };
}

export class LocalArtifactStore implements ArtifactFileStore {
  private readonly dataRoot: string;

  constructor(
    dataRoot: string,
    private readonly maximumImageBytes: number,
  ) {
    this.dataRoot = resolve(dataRoot);
  }

  async writeImage(input: {
    userId: string;
    projectId: string;
    kind: "portraits" | "illustrations";
    itemId: string;
    attemptId: string;
    image: GatewayImage;
  }): Promise<StoredArtifact> {
    assertSafeSegment(input.userId, "User ID");
    assertSafeSegment(input.projectId, "Project ID");
    assertSafeSegment(input.itemId, "Item ID");
    assertSafeSegment(input.attemptId, "Attempt ID");
    const validated = validateGatewayImage(input.image, this.maximumImageBytes);
    const directory = this.resolveContained(
      "users",
      input.userId,
      "projects",
      input.projectId,
      input.kind,
    );
    const filename = `${input.itemId}-${input.attemptId}.${extensionFor(validated.mimeType as SupportedImageMime)}`;
    const destination = this.assertContained(resolve(directory, filename));
    const temporary = this.assertContained(resolve(
      directory,
      `.${filename}.${randomBytes(12).toString("hex")}.partial`,
    ));

    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(input.image.bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, destination);
    } catch {
      await rm(temporary, { force: true });
      throw new ArtifactStorageError("LOCAL_IO_ERROR", "The generated image could not be stored locally.");
    }

    return {
      relativePath: relative(this.dataRoot, destination).split(sep).join("/"),
      mimeType: validated.mimeType as SupportedImageMime,
      byteCount: validated.byteCount,
      sha256: validated.sha256,
    };
  }

  async readImage(
    relativePath: string,
    expected: StoredArtifactExpectation,
  ): Promise<GatewayImage> {
    try {
      const absolutePath = this.resolveStoredPath(relativePath);
      const bytes = Uint8Array.from(await readFile(absolutePath));
      const actual = validateGatewayImage(
        { bytes, mimeType: expected.mimeType as SupportedImageMime },
        this.maximumImageBytes,
      );
      if (
        actual.byteCount !== expected.byteCount
        || actual.sha256 !== expected.sha256
        || actual.mimeType !== expected.mimeType
      ) {
        throw new Error("Stored artifact metadata mismatch");
      }
      return { bytes, mimeType: actual.mimeType as SupportedImageMime };
    } catch (error) {
      if (error instanceof ArtifactStorageError) throw error;
      throw new ArtifactStorageError("LOCAL_IO_ERROR", "The stored image is unavailable or invalid.");
    }
  }

  async remove(relativePath: string): Promise<void> {
    try {
      await rm(this.resolveStoredPath(relativePath), { force: true });
    } catch {
      // Best-effort orphan cleanup must not replace the primary fenced outcome.
    }
  }

  private resolveStoredPath(storedPath: string): string {
    if (!storedPath || storedPath.includes("\0")) {
      throw new ArtifactStorageError("LOCAL_IO_ERROR", "Stored artifact path is invalid.");
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
      throw new ArtifactStorageError("LOCAL_IO_ERROR", "Resolved artifact path escapes the private data directory.");
    }
    return candidate;
  }
}
