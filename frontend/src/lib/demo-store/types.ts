export type View = "identity" | "library" | "new" | "studio";
export type StepState = "idle" | "running" | "failed" | "stuck";
export type SourceMode = "upload" | "paste";

export type Character = {
  name: string;
  role: string;
  prompt: string;
};

export type Chapter = {
  name: string;
  prompt: string;
};

export type Project = {
  id: string;
  ownerEmail: string;
  volume: string;
  title: string;
  createdAt: string;
  bookText: string;
  completedSteps: number;
  stepState: StepState;
  error?: string;
  style?: string;
  characters: Character[];
  chapter?: Chapter;
  portraitProgress: number;
};

export type DemoSnapshot = {
  projects: Project[];
  userName: string;
  userEmail: string;
  activeProjectId: string;
  view: View;
};

export type NewVolumeDraft = {
  title: string;
  text: string;
  fileName: string;
};
