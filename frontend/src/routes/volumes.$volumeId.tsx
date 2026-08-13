import { createFileRoute } from "@tanstack/react-router";
import { StudioPage } from "../features/studio/StudioPage";

export const Route = createFileRoute("/volumes/$volumeId")({
  component: VolumeStudioRoute,
});

function VolumeStudioRoute() {
  const { volumeId } = Route.useParams();
  return <StudioPage volumeId={volumeId} />;
}
