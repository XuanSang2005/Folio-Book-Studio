import { createFileRoute, redirect } from "@tanstack/react-router";
import { ApiError } from "../lib/api/client";
import { sessionQueryOptions } from "../lib/api/queries";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(sessionQueryOptions());
      throw redirect({ to: "/library" });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      throw redirect({ to: "/login" });
    }
  },
});
