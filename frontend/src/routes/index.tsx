import { createFileRoute, redirect } from "@tanstack/react-router";
import { readSnapshot } from "../lib/demo-store/storage";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const snapshot = readSnapshot();
    if (snapshot.view === "identity" || !snapshot.userEmail) {
      throw redirect({ to: "/login" });
    }
    if (snapshot.view === "new") {
      throw redirect({ to: "/volumes/new" });
    }
    if (snapshot.view === "studio") {
      throw redirect({
        to: "/volumes/$volumeId",
        params: { volumeId: snapshot.activeProjectId },
      });
    }
    throw redirect({ to: "/library" });
  },
});
