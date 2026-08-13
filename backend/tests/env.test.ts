import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/env.js";

describe("environment validation", () => {
  it("uses the local backend port by default", () => {
    expect(parseEnvironment({} as NodeJS.ProcessEnv).PORT).toBe(3001);
  });

  it("rejects an invalid port", () => {
    expect(() => parseEnvironment({ PORT: "70000" } as NodeJS.ProcessEnv)).toThrow();
  });
});
