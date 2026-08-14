import { createFileRoute } from "@tanstack/react-router";
import { NewVolumePage } from "../features/volume-create/NewVolumePage";
import { requireSession } from "../lib/api/route-guards";

export const Route = createFileRoute("/volumes/new")({
  beforeLoad: ({ context }) => requireSession(context.queryClient),
  component: NewVolumePage,
});
