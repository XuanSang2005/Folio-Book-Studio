import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../lib/api/query-keys";
import { projectSummaryFixture, sessionFixture } from "../../test/fixtures";
import { createTestQueryClient, renderWithQueryClient } from "../../test/render";
import { Masthead } from "./Masthead";

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  useNavigate: () => routerMocks.navigate,
}));

afterEach(() => {
  routerMocks.navigate.mockReset();
  vi.unstubAllGlobals();
});

describe("Masthead", () => {
  it("ends the session and clears every cached user resource before login navigation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ signedOut: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.session, sessionFixture);
    queryClient.setQueryData(queryKeys.projectList, { projects: [projectSummaryFixture()] });
    renderWithQueryClient(<Masthead view="library" />, queryClient);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/login",
      replace: true,
    }));
    expect(queryClient.getQueryData(queryKeys.projectList)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.session)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({
      method: "DELETE",
      credentials: "same-origin",
    }));
  });

  it("preserves the active session and project caches when sign out fails, then allows retry", async () => {
    const failedResponse = new Response(JSON.stringify({
      error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
    }), { status: 500 });
    const successResponse = new Response(JSON.stringify({ signedOut: true }), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failedResponse)
      .mockResolvedValueOnce(successResponse);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const projects = { projects: [projectSummaryFixture()] };
    queryClient.setQueryData(queryKeys.session, sessionFixture);
    queryClient.setQueryData(queryKeys.projectList, projects);
    renderWithQueryClient(<Masthead view="library" />, queryClient);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out failed. Try again.");
    expect(routerMocks.navigate).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.session)).toEqual(sessionFixture);
    expect(queryClient.getQueryData(queryKeys.projectList)).toEqual(projects);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/login",
      replace: true,
    }));
    expect(fetchMock.mock.calls.filter(([input, init]) => (
      String(input) === "/api/session" && (init as RequestInit | undefined)?.method === "DELETE"
    ))).toHaveLength(2);
    expect(queryClient.getQueryData(queryKeys.session)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.projectList)).toBeUndefined();
  });
});
