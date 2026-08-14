import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { ApiError } from "./client";
import { sessionQueryOptions } from "./queries";

export type RouterContext = { queryClient: QueryClient };

export async function requireSession(queryClient: QueryClient) {
  try {
    return await queryClient.ensureQueryData(sessionQueryOptions());
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      queryClient.clear();
      throw redirect({ to: "/login" });
    }
    throw error;
  }
}

export async function redirectActiveSession(queryClient: QueryClient) {
  try {
    await queryClient.ensureQueryData(sessionQueryOptions());
    throw redirect({ to: "/library" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    throw error;
  }
}
