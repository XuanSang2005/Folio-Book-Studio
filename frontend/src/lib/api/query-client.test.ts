import { afterEach, describe, expect, it, vi } from "vitest";
import { projectSummaryFixture, sessionFixture } from "../../test/fixtures";
import { ApiError } from "./client";
import { createAppQueryClient } from "./query-client";
import { queryKeys } from "./query-keys";

afterEach(() => vi.restoreAllMocks());

describe("expired session handling", () => {
  it("clears authenticated caches and navigates once for concurrent protected 401 errors", async () => {
    let finishNavigation: (() => void) | undefined;
    const navigation = new Promise<void>((resolve) => {
      finishNavigation = resolve;
    });
    const onSessionExpired = vi.fn(() => navigation);
    const queryClient = createAppQueryClient({ onSessionExpired });
    queryClient.setQueryData(queryKeys.session, sessionFixture);
    queryClient.setQueryData(queryKeys.projectList, {
      projects: [projectSummaryFixture()],
    });

    await expect(queryClient.fetchQuery({
      queryKey: queryKeys.projectDetail("expired-one"),
      queryFn: () => Promise.reject(new ApiError(
        401,
        "UNAUTHENTICATED",
        "A valid session is required.",
      )),
    })).rejects.toMatchObject({ status: 401 });
    await expect(queryClient.fetchQuery({
      queryKey: queryKeys.projectManuscript("expired-two"),
      queryFn: () => Promise.reject(new ApiError(
        401,
        "UNAUTHENTICATED",
        "A valid session is required.",
      )),
    })).rejects.toMatchObject({ status: 401 });

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.session)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.projectList)).toBeUndefined();
    finishNavigation?.();
  });

  it("leaves normal initial unauthenticated session lookup to the route guard", async () => {
    const onSessionExpired = vi.fn();
    const queryClient = createAppQueryClient({ onSessionExpired });

    await expect(queryClient.fetchQuery({
      queryKey: queryKeys.session,
      queryFn: () => Promise.reject(new ApiError(
        401,
        "UNAUTHENTICATED",
        "A valid session is required.",
      )),
    })).rejects.toMatchObject({ status: 401 });

    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("does not clear authenticated caches for ordinary API errors", async () => {
    const onSessionExpired = vi.fn();
    const queryClient = createAppQueryClient({ onSessionExpired });
    queryClient.setQueryData(queryKeys.session, sessionFixture);
    queryClient.setQueryData(queryKeys.projectList, {
      projects: [projectSummaryFixture()],
    });

    await expect(queryClient.fetchQuery({
      queryKey: queryKeys.projectDetail("temporary-failure"),
      queryFn: () => Promise.reject(new ApiError(
        503,
        "PROVIDER_UNAVAILABLE",
        "Temporarily unavailable.",
      )),
    })).rejects.toMatchObject({ status: 503 });

    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.session)).toEqual(sessionFixture);
    expect(queryClient.getQueryData(queryKeys.projectList)).toBeDefined();
  });
});
