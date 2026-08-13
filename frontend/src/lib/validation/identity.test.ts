import { describe, expect, it } from "vitest";
import { validateIdentity } from "./identity";

describe("validateIdentity", () => {
  it("requires a full name", () => {
    expect(validateIdentity("", "reader@example.com")).toBe("Enter your full name to continue.");
  });

  it("requires a valid email", () => {
    expect(validateIdentity("Reader", "invalid")).toBe("Enter a valid email address to continue.");
  });

  it("accepts the prototype identity", () => {
    expect(validateIdentity("Xuan Sang", "sang@example.com")).toBe("");
  });
});
