import { createFileRoute } from "@tanstack/react-router";
import { StudioPage } from "../features/studio/StudioPage";
import { requireSession } from "../lib/api/route-guards";

export const Route = createFileRoute("/volumes/$volumeId")({
  beforeLoad: ({ context }) => requireSession(context.queryClient),
  component: VolumeStudioRoute,
});

function VolumeStudioRoute() {
  const { volumeId } = Route.useParams();
  return <StudioPage volumeId={volumeId} />;
}
