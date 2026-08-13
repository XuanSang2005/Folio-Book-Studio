import { SEED_PROJECTS, STORAGE_KEY } from "./data";
import type { DemoSnapshot, View } from "./types";

export const DEFAULT_SNAPSHOT: DemoSnapshot = {
  projects: SEED_PROJECTS,
  userName: "",
  userEmail: "",
  activeProjectId: "riverbank",
  view: "identity",
};

export function readSnapshot(): DemoSnapshot {
  if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SNAPSHOT;
    const snapshot = JSON.parse(stored) as Partial<DemoSnapshot>;
    const projects = snapshot.projects?.length
      ? snapshot.projects.map((project) => ({
          ...project,
          ownerEmail: project.ownerEmail ?? "sang@example.com",
        }))
      : SEED_PROJECTS;
    return {
      projects,
      userName: snapshot.userName ?? "",
      userEmail: snapshot.userEmail ?? "",
      activeProjectId: snapshot.activeProjectId ?? projects[0]?.id ?? "riverbank",
      view: snapshot.view ?? "identity",
    };
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}

export function writeSnapshot(snapshot: DemoSnapshot) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function initialDestination(snapshot = readSnapshot()) {
  if (snapshot.view === "identity" || !snapshot.userEmail) return "/login" as const;
  if (snapshot.view === "new") return "/volumes/new" as const;
  if (snapshot.view === "studio") {
    return `/volumes/${encodeURIComponent(snapshot.activeProjectId)}`;
  }
  return "/library" as const;
}

export function pathForView(view: View, activeProjectId: string) {
  if (view === "identity") return "/login";
  if (view === "library") return "/library";
  if (view === "new") return "/volumes/new";
  return `/volumes/${encodeURIComponent(activeProjectId)}`;
}
