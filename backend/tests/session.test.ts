import { afterEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../src/identity/session-service.js";
import { rawCookieToken, signIn } from "./helpers/api.js";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("session identity continuity", () => {
  it("creates an HttpOnly session while storing only the token hash", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { response, cookie } = await signIn(harness, {
      name: "First Reader",
      email: "Reader@Example.com",
    });
    const rawToken = rawCookieToken(cookie);
    const setCookie = response.headers["set-cookie"] as string;

    expect(response.json()).toMatchObject({
      user: { name: "First Reader", email: "Reader@Example.com" },
    });
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain(`Max-Age=${harness.config.SESSION_TTL_SECONDS}`);
    expect(setCookie).not.toContain("Secure");

    const session = harness.database.prepare("SELECT token_hash FROM sessions").get() as {
      token_hash: string;
    };
    expect(session.token_hash).toBe(hashSessionToken(rawToken));
    expect(JSON.stringify(session)).not.toContain(rawToken);
    expect(harness.database.prepare("SELECT email_normalized FROM users").get())
      .toEqual({ email_normalized: "reader@example.com" });
  });

  it("normalizes returning email and updates the display name on the same user", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const first = await signIn(harness, {
      name: "Earlier Name",
      email: "  Reader@Example.com ",
    });
    const project = await harness.app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: first.cookie },
      payload: {
        title: "Continuity volume",
        sourceMode: "paste",
        text: "Continuity manuscript.",
      },
    });
    expect(project.statusCode).toBe(201);
    const second = await signIn(harness, {
      name: "Current Name",
      email: "reader@example.COM",
    });

    expect(second.response.json().user.id).toBe(first.response.json().user.id);
    expect(second.response.json().user.name).toBe("Current Name");
    expect(harness.database.prepare("SELECT id, name FROM users").all()).toEqual([{
      id: first.response.json().user.id,
      name: "Current Name",
    }]);

    const projects = await harness.app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { cookie: second.cookie },
    });
    expect(projects.json().projects).toEqual([
      expect.objectContaining({ id: project.json().id, title: "Continuity volume" }),
    ]);

    const restored = await harness.app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: second.cookie },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().user).toMatchObject({ name: "Current Name", email: "reader@example.COM" });
  });

  it("rejects expired sessions according to the injected clock", async () => {
    const harness = await createTestHarness({
      environment: { SESSION_TTL_SECONDS: "60" },
    });
    harnesses.push(harness);
    const { cookie } = await signIn(harness);
    harness.clock.advance(60_001);

    const response = await harness.app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "A valid session is required." },
    });
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM sessions").get())
      .toEqual({ count: 0 });
  });

  it("sign-out deletes the server session and clears the cookie", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const { cookie } = await signIn(harness);

    const signedOut = await harness.app.inject({
      method: "DELETE",
      url: "/api/session",
      headers: { cookie },
    });
    expect(signedOut.statusCode).toBe(200);
    expect(signedOut.json()).toEqual({ signedOut: true });
    expect(signedOut.headers["set-cookie"]).toContain("Max-Age=0");
    expect(harness.database.prepare("SELECT COUNT(*) AS count FROM sessions").get())
      .toEqual({ count: 0 });

    const restored = await harness.app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie },
    });
    expect(restored.statusCode).toBe(401);
  });

  it("returns the stable unauthenticated envelope when the cookie is missing", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const response = await harness.app.inject({ method: "GET", url: "/api/session" });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });
});
