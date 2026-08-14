import { isRedirect } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionFixture } from "../../test/fixtures";
import { createTestQueryClient } from "../../test/render";
import { redirectActiveSession, requireSession } from "./route-guards";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("session route guards", () => {
  it("restores a valid session for a protected route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(sessionFixture)));
    const queryClient = createTestQueryClient();

    await expect(requireSession(queryClient)).resolves.toEqual(sessionFixture);
    expect(queryClient.getQueryData(["session"])).toEqual(sessionFixture);
  });

  it("redirects an unauthenticated protected route before rendering", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "UNAUTHENTICATED", message: "A valid session is required." },
    }, 401)));
    const error = await requireSession(createTestQueryClient()).catch((reason: unknown) => reason);

    expect(isRedirect(error)).toBe(true);
    expect(error).toMatchObject({ options: { to: "/login" } });
  });

  it("redirects an active session away from login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(sessionFixture)));
    const error = await redirectActiveSession(createTestQueryClient())
      .catch((reason: unknown) => reason);

    expect(isRedirect(error)).toBe(true);
    expect(error).toMatchObject({ options: { to: "/library" } });
  });
});
