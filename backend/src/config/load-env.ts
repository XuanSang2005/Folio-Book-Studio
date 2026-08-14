import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { ROOT_ENV_FILE } from "./paths.js";

export type LoadLocalEnvironmentOptions = {
  environment?: NodeJS.ProcessEnv;
  envFilePath?: string;
};

export async function loadLocalEnvironment({
  environment = process.env,
  envFilePath = ROOT_ENV_FILE,
}: LoadLocalEnvironmentOptions = {}): Promise<NodeJS.ProcessEnv> {
  let fileEnvironment: NodeJS.ProcessEnv = {};

  try {
    fileEnvironment = parseEnv(await readFile(envFilePath, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  return {
    ...fileEnvironment,
    ...environment,
  };
}
