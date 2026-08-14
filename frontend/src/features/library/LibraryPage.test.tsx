import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../lib/api/query-keys";
import { projectSummaryFixture, sessionFixture } from "../../test/fixtures";
import { createTestQueryClient, renderWithQueryClient } from "../../test/render";
import { LibraryPage } from "./LibraryPage";

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  useNavigate: () => routerMocks.navigate,
}));

function renderLibrary() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, sessionFixture);
  return renderWithQueryClient(<LibraryPage />, queryClient);
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

afterEach(() => {
  routerMocks.navigate.mockReset();
  vi.unstubAllGlobals();
});

describe("LibraryPage", () => {
  it("shows a loading ledger while the project request is pending", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
    renderLibrary();
    expect(screen.getByRole("heading", { name: "Loading your volumes…" })).toBeInTheDocument();
  });

  it("shows an API error and retries the real list request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
      }, 500))
      .mockResolvedValueOnce(jsonResponse({ projects: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderLibrary();

    expect(await screen.findByRole("heading", { name: "Your library is temporarily unavailable." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry library/ }));
    expect(await screen.findByRole("heading", { name: "Your first volume begins with a manuscript." })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the genuine empty library", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ projects: [] })));
    renderLibrary();

    expect(await screen.findByRole("heading", { name: "Your first volume begins with a manuscript." })).toBeInTheDocument();
    expect(screen.queryByText(/prototype specimen/i)).not.toBeInTheDocument();
  });

  it("renders backend word count, status, and five-stage progress", async () => {
    const project = projectSummaryFixture({
      status: "in_progress",
      completedStepCount: 3,
      sourceWordCount: 1_284,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ projects: [project] })));
    const user = userEvent.setup();
    const { container } = renderLibrary();

    expect(await screen.findByText(project.title)).toBeInTheDocument();
    expect(screen.getByText(/1,284 words/)).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByLabelText("3 of 5 stages complete")).toBeInTheDocument();
    expect(container.querySelectorAll(".progress-rule .filled")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: new RegExp(project.title) }));
    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/volumes/$volumeId",
      params: { volumeId: project.id },
    }));
  });
});
