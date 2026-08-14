import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_ROOT = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);

export const ROOT_ENV_FILE = resolve(RUNTIME_ROOT, ".env");
export const FRONTEND_DIST_DIR = resolve(RUNTIME_ROOT, "frontend", "dist");
export const DEFAULT_DATA_DIR = resolve(RUNTIME_ROOT, "data");
export const DEFAULT_DATABASE_PATH = resolve(DEFAULT_DATA_DIR, "folio.sqlite");

export function resolveRuntimePath(value: string): string {
  return resolve(RUNTIME_ROOT, value);
}
