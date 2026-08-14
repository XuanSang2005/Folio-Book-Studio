import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../lib/api/query-keys";
import {
  chapterFixture,
  characterOne,
  characterTwo,
  projectFixture,
  sessionFixture,
  stepFixtures,
} from "../../test/fixtures";
import { createTestQueryClient, renderWithQueryClient } from "../../test/render";
import { StudioPage } from "./StudioPage";

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  useNavigate: () => routerMocks.navigate,
}));

const manuscript = "The first page opened beneath a copper lamp.";

function renderStudio(project = projectFixture(), includeManuscript = true) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, sessionFixture);
  queryClient.setQueryData(queryKeys.projectDetail(project.id), project);
  if (includeManuscript) {
    queryClient.setQueryData(queryKeys.projectManuscript(project.id), { text: manuscript });
  }
  return renderWithQueryClient(<StudioPage volumeId={project.id} />, queryClient);
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function requestsTo(fetchMock: ReturnType<typeof vi.fn>, path: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === path);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  routerMocks.navigate.mockReset();
});

describe("StudioPage persisted state mapping", () => {
  it.each([
    ["pending", projectFixture(), "Establish the visual grammar."],
    ["running", projectFixture({
      status: "in_progress",
      steps: stepFixtures(["running"]),
    }), "Gemini request in flight · duplicate execution locked"],
    ["failed", projectFixture({
      status: "in_progress",
      steps: stepFixtures(["failed"]),
    }), "Style could not be completed."],
    ["stuck", projectFixture({
      status: "in_progress",
      steps: stepFixtures(["stuck"]),
    }), "This stage has stopped responding."],
    ["complete", projectFixture({
      status: "done",
      completedStepCount: 5,
      steps: stepFixtures(["succeeded", "succeeded", "succeeded", "succeeded", "succeeded"]),
    }), "The final plate is in the folio."],
  ])("renders the %s server state", (_name, project, expected) => {
    renderStudio(project);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows one portrait before the second and reports the actual cast slot count", () => {
    renderStudio(projectFixture({
      status: "in_progress",
      completedStepCount: 2,
      steps: stepFixtures(["succeeded", "succeeded", "running"]),
      characters: [characterOne, characterTwo],
    }));

    expect(screen.getByText("THE CAST · 2 OF 2 SLOTS USED")).toBeInTheDocument();
    expect(screen.getByAltText("Illustrated portrait of Mole")).toHaveAttribute("src", characterOne.portraitUrl);
    expect(screen.queryByAltText("Illustrated portrait of Ratty")).not.toBeInTheDocument();
    expect(screen.getByText(/Rendering plate II/)).toBeInTheDocument();
  });

  it("renders one-character count and only real portrait/final illustration URLs", async () => {
    const oneCharacterChapter = { ...chapterFixture, characterNames: ["Mole"] };
    renderStudio(projectFixture({
      status: "done",
      completedStepCount: 5,
      steps: stepFixtures(["succeeded", "succeeded", "succeeded", "succeeded", "succeeded"]),
      characters: [characterOne],
      chapters: [oneCharacterChapter],
    }));

    expect(screen.getByText("THE CAST · 1 OF 2 SLOTS USED")).toBeInTheDocument();
    expect(screen.getByAltText("Illustrated portrait of Mole")).toHaveAttribute("src", characterOne.portraitUrl);
    const finalButton = screen.getByRole("button", { name: `Open final illustration for ${chapterFixture.name}` });
    expect(finalButton.querySelector("img")).toHaveAttribute("src", chapterFixture.illustrationUrl);
    await userEvent.click(finalButton);
    expect(screen.getByRole("dialog", { name: /Final illustration/ }).querySelector("img"))
      .toHaveAttribute("src", chapterFixture.illustrationUrl);
  });

  it("shows authoritative stuck state after STEP_STUCK reconciliation, never Retry", async () => {
    const stuck = projectFixture({
      status: "in_progress",
      steps: stepFixtures(["stuck"]),
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/run")) {
        return jsonResponse({
          error: { code: "STEP_STUCK", message: "The active attempt lease has expired." },
        }, 409);
      }
      if (url === "/api/projects/project-1") return jsonResponse(stuck);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderStudio();
    await userEvent.click(screen.getByRole("button", { name: /Generate Style/ }));

    expect(await screen.findByRole("button", { name: /Recover this stage/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry Style/ })).not.toBeInTheDocument();
    expect(requestsTo(fetchMock, "/api/projects/project-1")).toHaveLength(1);
    expect(requestsTo(fetchMock, "/api/projects/project-1/manuscript")).toHaveLength(0);
  });

  it("keeps Retry on Run and Recover changes stuck to failed without an automatic rerun", async () => {
    const failed = projectFixture({ status: "in_progress", steps: stepFixtures(["failed"]) });
    const recovered = projectFixture({ status: "in_progress", steps: stepFixtures(["failed"]) });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/run")) return jsonResponse({ disposition: "succeeded", project: projectFixture() });
      if (url.endsWith("/recover")) return jsonResponse({ disposition: "recovered", project: recovered });
      return jsonResponse(recovered);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const first = renderStudio(failed);

    await user.click(screen.getByRole("button", { name: /Retry Style/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/steps/1/run",
      expect.objectContaining({ method: "POST" }),
    ));
    first.unmount();
    fetchMock.mockClear();

    renderStudio(projectFixture({ status: "in_progress", steps: stepFixtures(["stuck"]) }));
    await user.click(screen.getByRole("button", { name: /Recover this stage/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/steps/1/recover",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/run"))).toBe(false);
    expect(await screen.findByRole("button", { name: /Retry Style/ })).toBeInTheDocument();
    expect(requestsTo(fetchMock, "/api/projects/project-1")).toHaveLength(0);
    expect(requestsTo(fetchMock, "/api/projects/project-1/manuscript")).toHaveLength(0);
  });

  it("seeds a completed Run response without refetching detail or manuscript", async () => {
    const advanced = projectFixture({
      status: "in_progress",
      completedStepCount: 1,
      steps: stepFixtures(["succeeded", "pending"]),
      style: "A persisted visual grammar.",
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/run")) {
        return jsonResponse({ disposition: "succeeded", project: advanced });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderStudio();
    await userEvent.click(screen.getByRole("button", { name: /Generate Style/ }));

    expect(await screen.findByRole("button", { name: /Generate Characters/ })).toBeInTheDocument();
    expect(requestsTo(fetchMock, "/api/projects/project-1")).toHaveLength(0);
    expect(requestsTo(fetchMock, "/api/projects/project-1/manuscript")).toHaveLength(0);
  });

  it("polls project detail while a run request remains pending and stops after unmount", async () => {
    vi.useFakeTimers();
    const running = projectFixture({ status: "in_progress", steps: stepFixtures(["running"]) });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/run")) return new Promise<Response>(() => undefined);
      return Promise.resolve(jsonResponse(running));
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderStudio();

    fireEvent.click(screen.getByRole("button", { name: /Generate Style/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600); });
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/projects/project-1")).toBe(true);

    view.unmount();
    const callsAfterUnmount = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3_200); });
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterUnmount);
  });

  it("keeps an advanced pending step Ready while the preceding Run mutation settles", async () => {
    vi.useFakeTimers();
    const advanced = projectFixture({
      status: "in_progress",
      completedStepCount: 1,
      steps: stepFixtures(["succeeded", "pending"]),
      style: "A persisted visual grammar.",
    });
    let resolveRun: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/run")) {
        return new Promise<Response>((resolve) => {
          resolveRun = resolve;
        });
      }
      if (url === "/api/projects/project-1") return Promise.resolve(jsonResponse(advanced));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /Generate Style/ }));

    await act(async () => { await vi.advanceTimersByTimeAsync(1_600); });

    expect(screen.getByRole("heading", { name: "Generate characters." })).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 2 of 5, Characters, Ready/)).toBeInTheDocument();
    expect(screen.queryByText(/Gemini request in flight/)).not.toBeInTheDocument();
    expect(requestsTo(fetchMock, "/api/projects/project-1")).toHaveLength(1);
    expect(requestsTo(fetchMock, "/api/projects/project-1/manuscript")).toHaveLength(0);

    await act(async () => {
      resolveRun?.(jsonResponse({ disposition: "succeeded", project: advanced }));
      await Promise.resolve();
    });
  });
});

describe("StudioPage manuscript dialog", () => {
  it("renders persisted manuscript success", async () => {
    renderStudio();
    await userEvent.click(screen.getByRole("button", { name: /Read the complete text/ }));
    expect(screen.getByRole("dialog", { name: /Riverbank Edition/ })).toHaveTextContent(manuscript);
  });

  it("renders manuscript loading and error states with an explicit retry", async () => {
    let resolveRequest: ((value: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    })));
    const user = userEvent.setup();
    renderStudio(projectFixture(), false);
    await user.click(screen.getByRole("button", { name: /Read the complete text/ }));
    expect(screen.getByText("Loading the complete manuscript…")).toBeInTheDocument();

    resolveRequest?.(jsonResponse({
      error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
    }, 500));
    expect(await screen.findByText(/complete manuscript could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry manuscript/ })).toBeInTheDocument();
  });
});
