import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EnvironmentValidationError,
  parseEnvironment,
} from "../src/config/env.js";
import { loadLocalEnvironment } from "../src/config/load-env.js";
import {
  DEFAULT_DATABASE_PATH,
  DEFAULT_DATA_DIR,
  RUNTIME_ROOT,
} from "../src/config/paths.js";

describe("environment validation", () => {
  it("provides repository-rooted defaults without requiring Gemini configuration", () => {
    const environment = parseEnvironment({} as NodeJS.ProcessEnv);

    expect(environment).toMatchObject({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: 3001,
      DATABASE_PATH: DEFAULT_DATABASE_PATH,
      DATA_DIR: DEFAULT_DATA_DIR,
      GEMINI_TEXT_MODEL: "gemini-3.6-flash",
      GEMINI_IMAGE_MODEL: "gemini-3.1-flash-image",
      GEMINI_REQUEST_TIMEOUT_MS: 120_000,
      STEP_LEASE_MS: 180_000,
      HEARTBEAT_MS: 30_000,
      SESSION_TTL_SECONDS: 604_800,
      MAX_SOURCE_BYTES: 5 * 1024 * 1024,
      MAX_IMAGE_BYTES: 15 * 1024 * 1024,
      LOG_LEVEL: "info",
      COOKIE_NAME: "folio_session",
    });
    expect(DEFAULT_DATA_DIR).toBe(resolve(RUNTIME_ROOT, "data"));
    expect(environment.GEMINI_API_KEY).toBeUndefined();
  });

  it("keeps default runtime paths stable when the working directory changes", async () => {
    const originalWorkingDirectory = process.cwd();
    const unrelatedDirectory = await mkdtemp(join(tmpdir(), "gradion-cwd-test-"));

    try {
      process.chdir(unrelatedDirectory);
      const environment = parseEnvironment({} as NodeJS.ProcessEnv);
      expect(environment.DATA_DIR).toBe(DEFAULT_DATA_DIR);
      expect(environment.DATABASE_PATH).toBe(DEFAULT_DATABASE_PATH);
    } finally {
      process.chdir(originalWorkingDirectory);
      await rm(unrelatedDirectory, { recursive: true, force: true });
    }
  });

  it("resolves relative runtime paths once and preserves absolute overrides", () => {
    const relative = parseEnvironment({
      DATA_DIR: "var/data",
      DATABASE_PATH: "var/database/folio.sqlite",
    } as NodeJS.ProcessEnv);
    expect(relative.DATA_DIR).toBe(resolve(RUNTIME_ROOT, "var/data"));
    expect(relative.DATABASE_PATH).toBe(resolve(RUNTIME_ROOT, "var/database/folio.sqlite"));

    const absoluteData = join(tmpdir(), "gradion-absolute-data");
    const absoluteDatabase = join(tmpdir(), "gradion-absolute-db", "folio.sqlite");
    const absolute = parseEnvironment({
      DATA_DIR: absoluteData,
      DATABASE_PATH: absoluteDatabase,
    } as NodeJS.ProcessEnv);
    expect(absolute.DATA_DIR).toBe(absoluteData);
    expect(absolute.DATABASE_PATH).toBe(absoluteDatabase);
  });

  it("coerces and accepts valid environment overrides", () => {
    const environment = parseEnvironment({
      NODE_ENV: "test",
      HOST: "localhost",
      PORT: "4100",
      DATABASE_PATH: "/tmp/folio-test.sqlite",
      DATA_DIR: "/tmp/folio-test-data",
      GEMINI_API_KEY: "test-placeholder-key",
      GEMINI_TEXT_MODEL: "text-model-override",
      GEMINI_IMAGE_MODEL: "image-model-override",
      GEMINI_REQUEST_TIMEOUT_MS: "90000",
      STEP_LEASE_MS: "120000",
      HEARTBEAT_MS: "30000",
      SESSION_TTL_SECONDS: "3600",
      MAX_SOURCE_BYTES: "1048576",
      MAX_IMAGE_BYTES: "2097152",
      LOG_LEVEL: "debug",
      COOKIE_NAME: "folio_test_session",
    } as NodeJS.ProcessEnv);

    expect(environment).toMatchObject({
      NODE_ENV: "test",
      HOST: "localhost",
      PORT: 4100,
      GEMINI_API_KEY: "test-placeholder-key",
      GEMINI_REQUEST_TIMEOUT_MS: 90_000,
      STEP_LEASE_MS: 120_000,
      HEARTBEAT_MS: 30_000,
      LOG_LEVEL: "debug",
    });
  });

  it.each([
    [{ PORT: "70000" }, "PORT"],
    [{ DATABASE_PATH: " " }, "DATABASE_PATH"],
    [{ DATA_DIR: "" }, "DATA_DIR"],
    [{ MAX_SOURCE_BYTES: "0" }, "MAX_SOURCE_BYTES"],
    [{ COOKIE_NAME: "not valid" }, "COOKIE_NAME"],
  ])("identifies the invalid field for %j", (change, expectedField) => {
    expect(() => parseEnvironment(change as NodeJS.ProcessEnv)).toThrowError(
      expect.objectContaining<Partial<EnvironmentValidationError>>({
        fields: expect.arrayContaining([expectedField]),
      }),
    );
  });

  it("permits only explicit loopback hosts in production", () => {
    for (const host of ["127.0.0.1", "localhost", "::1"]) {
      expect(parseEnvironment({ NODE_ENV: "production", HOST: host } as NodeJS.ProcessEnv).HOST)
        .toBe(host);
    }

    for (const host of ["0.0.0.0", "::", "192.168.1.10", "10.0.0.4", "example.com"]) {
      expect(() => parseEnvironment({ NODE_ENV: "production", HOST: host } as NodeJS.ProcessEnv))
        .toThrowError(expect.objectContaining<Partial<EnvironmentValidationError>>({
          fields: expect.arrayContaining(["HOST"]),
        }));
    }

    expect(parseEnvironment({ NODE_ENV: "development", HOST: "0.0.0.0" } as NodeJS.ProcessEnv).HOST)
      .toBe("0.0.0.0");
  });

  it("requires heartbeat intervals below half of the step lease", () => {
    expect(() => parseEnvironment({
      STEP_LEASE_MS: "60000",
      HEARTBEAT_MS: "30000",
    } as NodeJS.ProcessEnv)).toThrow("HEARTBEAT_MS must be less than half of STEP_LEASE_MS");
  });

  it("treats an empty Gemini key as not configured", () => {
    expect(parseEnvironment({ GEMINI_API_KEY: "  " } as NodeJS.ProcessEnv).GEMINI_API_KEY)
      .toBeUndefined();
  });

  it("loads a root-style .env file while preserving explicit shell values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gradion-env-test-"));
    const envFilePath = join(directory, ".env");

    try {
      await writeFile(envFilePath, [
        "PORT=4111",
        "LOG_LEVEL=debug",
        "GEMINI_API_KEY=file-secret",
      ].join("\n"));
      const loaded = await loadLocalEnvironment({
        envFilePath,
        environment: {
          PORT: "4222",
          GEMINI_API_KEY: "",
        },
      });

      expect(loaded).toMatchObject({ PORT: "4222", LOG_LEVEL: "debug", GEMINI_API_KEY: "" });
      expect(parseEnvironment(loaded)).toMatchObject({ PORT: 4222, LOG_LEVEL: "debug" });
      expect(parseEnvironment(loaded).GEMINI_API_KEY).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts a missing .env file without consulting ambient secrets", async () => {
    const loaded = await loadLocalEnvironment({
      envFilePath: join(tmpdir(), "gradion-missing-env-file"),
      environment: {},
    });

    expect(loaded).toEqual({});
    expect(parseEnvironment(loaded).GEMINI_API_KEY).toBeUndefined();
  });
});
