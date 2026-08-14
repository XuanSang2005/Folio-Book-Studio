import { z } from "zod";
import {
  DEFAULT_DATABASE_PATH,
  DEFAULT_DATA_DIR,
  resolveRuntimePath,
} from "./paths.js";

const MiB = 1024 * 1024;

function optionalSecret(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1, "HOST must not be empty").default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_PATH: z.string().trim().min(1, "DATABASE_PATH must not be empty").default(DEFAULT_DATABASE_PATH),
  DATA_DIR: z.string().trim().min(1, "DATA_DIR must not be empty").default(DEFAULT_DATA_DIR),
  GEMINI_API_KEY: z.preprocess(optionalSecret, z.string().min(1).optional()),
  GEMINI_TEXT_MODEL: z.string().trim().min(1).default("gemini-3.6-flash"),
  GEMINI_IMAGE_MODEL: z.string().trim().min(1).default("gemini-3.1-flash-image"),
  GEMINI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(10 * 60_000).default(120_000),
  STEP_LEASE_MS: z.coerce.number().int().min(10_000).max(60 * 60_000).default(180_000),
  HEARTBEAT_MS: z.coerce.number().int().min(1_000).max(30 * 60_000).default(30_000),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(365 * 24 * 60 * 60).default(7 * 24 * 60 * 60),
  MAX_SOURCE_BYTES: z.coerce.number().int().min(1).max(50 * MiB).default(5 * MiB),
  MAX_IMAGE_BYTES: z.coerce.number().int().min(1).max(100 * MiB).default(15 * MiB),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  COOKIE_NAME: z.string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/, "COOKIE_NAME must be a valid cookie token")
    .default("folio_session"),
}).superRefine((environment, context) => {
  if (environment.HEARTBEAT_MS >= environment.STEP_LEASE_MS / 2) {
    context.addIssue({
      code: "custom",
      path: ["HEARTBEAT_MS"],
      message: "HEARTBEAT_MS must be less than half of STEP_LEASE_MS",
    });
  }
  if (
    environment.NODE_ENV === "production"
    && !["127.0.0.1", "localhost", "::1"].includes(environment.HOST)
  ) {
    context.addIssue({
      code: "custom",
      path: ["HOST"],
      message: "HOST must remain loopback-scoped in production",
    });
  }
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export class EnvironmentValidationError extends Error {
  readonly fields: readonly string[];

  constructor(error: z.ZodError) {
    const issues = error.issues.map((issue) => {
      const field = issue.path.join(".") || "environment";
      return `${field}: ${issue.message}`;
    });
    super(`Invalid environment configuration: ${issues.join("; ")}`);
    this.name = "EnvironmentValidationError";
    this.fields = [...new Set(error.issues.map((issue) => issue.path.join(".") || "environment"))];
  }
}

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = EnvironmentSchema.safeParse(input);
  if (!result.success) throw new EnvironmentValidationError(result.error);
  return {
    ...result.data,
    DATA_DIR: resolveRuntimePath(result.data.DATA_DIR),
    DATABASE_PATH: resolveRuntimePath(result.data.DATABASE_PATH),
  };
}
