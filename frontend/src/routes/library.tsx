import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "../features/library/LibraryPage";
import { requireSession } from "../lib/api/route-guards";

export const Route = createFileRoute("/library")({
  beforeLoad: ({ context }) => requireSession(context.queryClient),
  component: LibraryPage,
});
