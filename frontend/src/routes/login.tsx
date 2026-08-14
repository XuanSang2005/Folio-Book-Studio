import { createFileRoute } from "@tanstack/react-router";
import { IdentityPage } from "../features/auth/IdentityPage";
import { redirectActiveSession } from "../lib/api/route-guards";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => redirectActiveSession(context.queryClient),
  component: IdentityPage,
});
