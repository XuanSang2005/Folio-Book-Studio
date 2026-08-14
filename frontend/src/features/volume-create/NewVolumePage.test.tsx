import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../lib/api/query-keys";
import { projectFixture, projectSummaryFixture, sessionFixture } from "../../test/fixtures";
import { createTestQueryClient, renderWithQueryClient } from "../../test/render";
import { NewVolumePage } from "./NewVolumePage";

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  useNavigate: () => routerMocks.navigate,
}));

function renderPage() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, sessionFixture);
  return renderWithQueryClient(<NewVolumePage />, queryClient);
}

function projectResponse(mode: "paste" | "upload") {
  return new Response(JSON.stringify(projectFixture({
    source: mode === "paste"
      ? { mode, originalName: null, byteCount: 20, wordCount: 3 }
      : { mode, originalName: "manuscript.txt", byteCount: 20, wordCount: 3 },
  })), { status: 201 });
}

afterEach(() => {
  routerMocks.navigate.mockReset();
  vi.unstubAllGlobals();
});

describe("NewVolumePage", () => {
  it("submits paste mode as the authoritative JSON shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(projectResponse("paste"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    const existingManuscript = { text: "Existing manuscript remains isolated." };
    queryClient.setQueryData(queryKeys.projectList, {
      projects: [projectSummaryFixture({ id: "existing-project" })],
    });
    queryClient.setQueryData(
      queryKeys.projectManuscript("existing-project"),
      existingManuscript,
    );

    await user.type(screen.getByLabelText("Volume title"), "Pasted edition");
    await user.click(screen.getByRole("button", { name: "Paste text instead" }));
    await user.type(screen.getByLabelText("Paste the complete manuscript"), "The full manuscript text.");
    await user.click(screen.getByRole("button", { name: /Use pasted text/ }));
    await user.click(screen.getByRole("button", { name: /Create this volume/ }));

    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/volumes/$volumeId",
      params: { volumeId: "project-1" },
    }));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Pasted edition",
      sourceMode: "paste",
      text: "The full manuscript text.",
    });
    expect(queryClient.getQueryData(queryKeys.projectDetail("project-1"))).toEqual(
      projectFixture({
        source: { mode: "paste", originalName: null, byteCount: 20, wordCount: 3 },
      }),
    );
    expect(queryClient.getQueryState(queryKeys.projectList)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(queryKeys.projectManuscript("existing-project")))
      .toEqual(existingManuscript);
    expect(queryClient.getQueryState(queryKeys.projectManuscript("existing-project"))?.isInvalidated)
      .toBe(false);
    expect(queryClient.getQueryData(queryKeys.projectManuscript("project-1"))).toBeUndefined();
  });

  it("retains the selected File and submits it unchanged as multipart", async () => {
    const fetchMock = vi.fn().mockResolvedValue(projectResponse("upload"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { container } = renderPage();
    const file = new File(["The full manuscript text."], "manuscript.txt", { type: "text/plain" });

    await user.type(screen.getByLabelText("Volume title"), "Uploaded edition");
    await user.click(screen.getByRole("button", { name: "Upload manuscript" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    expect(await screen.findByText("manuscript.txt", { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Create this volume/ }));

    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
  });
});
