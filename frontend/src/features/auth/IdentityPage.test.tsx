import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionFixture } from "../../test/fixtures";
import { renderWithQueryClient } from "../../test/render";
import { IdentityPage } from "./IdentityPage";

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  useNavigate: () => routerMocks.navigate,
}));

afterEach(() => {
  routerMocks.navigate.mockReset();
  vi.unstubAllGlobals();
});

describe("IdentityPage", () => {
  it("creates a server session, caches it, and enters the library", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(sessionFixture), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<IdentityPage />);

    await user.type(screen.getByLabelText("Full name"), "Baseline Reader");
    await user.type(screen.getByLabelText("Email"), "reader@example.com");
    await user.click(screen.getByRole("button", { name: /Enter/ }));

    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith({ to: "/library" }));
    expect(queryClient.getQueryData(["session"])).toEqual(sessionFixture);
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "Baseline Reader", email: "reader@example.com" }),
    }));
    expect(screen.queryByText(/sample library/i)).not.toBeInTheDocument();
  });
});
