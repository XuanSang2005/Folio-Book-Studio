import { createFileRoute } from "@tanstack/react-router";
import { NewVolumePage } from "../features/volume-create/NewVolumePage";

export const Route = createFileRoute("/volumes/new")({
  component: NewVolumePage,
});
