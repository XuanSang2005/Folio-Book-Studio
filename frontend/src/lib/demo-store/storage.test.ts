import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./data";
import { initialDestination, readSnapshot } from "./storage";

describe("demo storage boundary", () => {
  beforeEach(() => window.localStorage.clear());

  it("falls back to the curated login state", () => {
    expect(readSnapshot().projects).toHaveLength(3);
    expect(initialDestination()).toBe("/login");
  });

  it("restores a persisted Studio destination", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...readSnapshot(),
      userEmail: "sang@example.com",
      view: "studio",
      activeProjectId: "riverbank",
    }));

    expect(initialDestination()).toBe("/volumes/riverbank");
  });
});
