import { createFileRoute } from "@tanstack/react-router";
import { IdentityPage } from "../features/auth/IdentityPage";

export const Route = createFileRoute("/login")({
  component: IdentityPage,
});
