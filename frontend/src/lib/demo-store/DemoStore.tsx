import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { SAMPLE_CHAPTER, SAMPLE_CHARACTERS, SAMPLE_STYLE, STEPS } from "./data";
import { readSnapshot, writeSnapshot } from "./storage";
import type { DemoSnapshot, NewVolumeDraft, Project, View } from "./types";

type DemoStoreValue = DemoSnapshot & {
  hydrated: boolean;
  signedIn: boolean;
  activeProject?: Project;
  draft: NewVolumeDraft;
  artDirection: string;
  emptyLibrary: boolean;
  setView: (view: View) => void;
  setIdentityDraft: (draft: { userName?: string; userEmail?: string }) => void;
  setIdentity: (name: string, email: string) => void;
  enterSampleIdentity: () => void;
  signOut: () => void;
  setActiveProjectId: (id: string) => void;
  setDraft: (draft: Partial<NewVolumeDraft>) => void;
  clearDraft: () => void;
  setArtDirection: (value: string) => void;
  setEmptyLibrary: (value: boolean | ((current: boolean) => boolean)) => void;
  createProject: () => string;
  updateProject: (id: string, updater: (project: Project) => Project) => void;
  runCurrentStep: (projectId?: string) => void;
  retryStep: (projectId?: string) => void;
  recoverStep: (projectId?: string) => void;
  clearTimers: () => void;
};

const EMPTY_DRAFT: NewVolumeDraft = { title: "", text: "", fileName: "" };
const DemoStoreContext = createContext<DemoStoreValue | null>(null);

export function DemoStoreProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<DemoSnapshot>(readSnapshot);
  const [draft, replaceDraft] = useState<NewVolumeDraft>(EMPTY_DRAFT);
  const [artDirection, setArtDirection] = useState("");
  const [emptyLibrary, setEmptyLibrary] = useState(false);
  const [hydrated] = useState(true);
  const timersRef = useRef<number[]>([]);
  const snapshotRef = useRef(snapshot);
  const artDirectionRef = useRef(artDirection);

  useEffect(() => {
    snapshotRef.current = snapshot;
    writeSnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    artDirectionRef.current = artDirection;
  }, [artDirection]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const schedule = useCallback((callback: () => void, delay: number) => {
    timersRef.current.push(window.setTimeout(callback, delay));
  }, []);

  const updateProject = useCallback(
    (id: string, updater: (project: Project) => Project) => {
      setSnapshot((current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.id === id ? updater(project) : project,
        ),
      }));
    },
    [],
  );

  const setView = useCallback((view: View) => {
    setSnapshot((current) => current.view === view ? current : { ...current, view });
  }, []);

  const setIdentity = useCallback((name: string, email: string) => {
    setEmptyLibrary(false);
    setSnapshot((current) => ({
      ...current,
      userName: name.trim(),
      userEmail: email.trim().toLowerCase(),
      view: "library",
    }));
  }, []);

  const setIdentityDraft = useCallback((change: { userName?: string; userEmail?: string }) => {
    setSnapshot((current) => ({ ...current, ...change }));
  }, []);

  const enterSampleIdentity = useCallback(() => {
    setEmptyLibrary(false);
    setSnapshot((current) => ({
      ...current,
      userName: "Xuan Sang",
      userEmail: "sang@example.com",
      view: "library",
    }));
  }, []);

  const signOut = useCallback(() => {
    clearTimers();
    setSnapshot((current) => ({ ...current, view: "identity" }));
  }, [clearTimers]);

  const setActiveProjectId = useCallback((id: string) => {
    setSnapshot((current) => ({ ...current, activeProjectId: id, view: "studio" }));
    setArtDirection("");
  }, []);

  const setDraft = useCallback((change: Partial<NewVolumeDraft>) => {
    replaceDraft((current) => ({ ...current, ...change }));
  }, []);

  const clearDraft = useCallback(() => replaceDraft(EMPTY_DRAFT), []);

  const createProject = useCallback(() => {
    const current = snapshotRef.current;
    const id = `volume-${Date.now()}`;
    const project: Project = {
      id,
      ownerEmail: current.userEmail.trim().toLowerCase(),
      volume: `VOL. ${String(current.projects.length + 1).padStart(2, "0")}`,
      title: draft.title.trim(),
      createdAt: new Date().toISOString(),
      bookText: draft.text.trim(),
      completedSteps: 0,
      stepState: "idle",
      characters: [],
      portraitProgress: 0,
    };
    setSnapshot((stored) => ({
      ...stored,
      projects: [project, ...stored.projects],
      activeProjectId: id,
      view: "studio",
    }));
    clearDraft();
    return id;
  }, [clearDraft, draft.text, draft.title]);

  const finishStep = useCallback(
    (projectId: string, step: number, direction: string) => {
      updateProject(projectId, (project) => {
        const next: Project = {
          ...project,
          completedSteps: Math.max(project.completedSteps, step + 1),
          stepState: "idle",
          error: undefined,
        };
        if (step === 0) next.style = direction.trim() || SAMPLE_STYLE;
        if (step === 1) next.characters = SAMPLE_CHARACTERS;
        if (step === 2) next.portraitProgress = 2;
        if (step === 3) next.chapter = SAMPLE_CHAPTER;
        return next;
      });
    },
    [updateProject],
  );

  const runCurrentStep = useCallback(
    (requestedProjectId?: string) => {
      const current = snapshotRef.current;
      const projectId = requestedProjectId ?? current.activeProjectId;
      const project = current.projects.find((item) => item.id === projectId);
      if (!project || project.completedSteps >= STEPS.length || project.stepState === "running") {
        return;
      }

      clearTimers();
      const step = project.completedSteps;
      const direction = artDirectionRef.current;
      updateProject(projectId, (item) => ({
        ...item,
        stepState: "running",
        error: undefined,
        portraitProgress: step === 2 ? 0 : item.portraitProgress,
      }));

      if (step === 2) {
        schedule(() => {
          updateProject(projectId, (item) => ({ ...item, portraitProgress: 1 }));
        }, 850);
      }
      schedule(() => finishStep(projectId, step, direction), step === 2 ? 2100 : 1450);
    },
    [clearTimers, finishStep, schedule, updateProject],
  );

  const retryStep = useCallback(
    (requestedProjectId?: string) => {
      const projectId = requestedProjectId ?? snapshotRef.current.activeProjectId;
      updateProject(projectId, (project) => ({
        ...project,
        stepState: "idle",
        error: undefined,
      }));
      schedule(() => runCurrentStep(projectId), 80);
    },
    [runCurrentStep, schedule, updateProject],
  );

  const recoverStep = useCallback(
    (requestedProjectId?: string) => {
      const projectId = requestedProjectId ?? snapshotRef.current.activeProjectId;
      clearTimers();
      updateProject(projectId, (project) => ({
        ...project,
        stepState: "idle",
        error: undefined,
      }));
    },
    [clearTimers, updateProject],
  );

  const activeProject = useMemo(
    () => snapshot.projects.find((project) => project.id === snapshot.activeProjectId)
      ?? snapshot.projects[0],
    [snapshot.activeProjectId, snapshot.projects],
  );

  const value = useMemo<DemoStoreValue>(() => ({
    ...snapshot,
    hydrated,
    signedIn: snapshot.view !== "identity" && Boolean(snapshot.userEmail),
    activeProject,
    draft,
    artDirection,
    emptyLibrary,
    setView,
    setIdentityDraft,
    setIdentity,
    enterSampleIdentity,
    signOut,
    setActiveProjectId,
    setDraft,
    clearDraft,
    setArtDirection,
    setEmptyLibrary,
    createProject,
    updateProject,
    runCurrentStep,
    retryStep,
    recoverStep,
    clearTimers,
  }), [
    activeProject,
    artDirection,
    clearDraft,
    clearTimers,
    createProject,
    draft,
    emptyLibrary,
    hydrated,
    recoverStep,
    retryStep,
    runCurrentStep,
    setActiveProjectId,
    setDraft,
    setIdentity,
    setIdentityDraft,
    setView,
    signOut,
    snapshot,
    updateProject,
    enterSampleIdentity,
  ]);

  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>;
}

export function useDemoStore() {
  const store = useContext(DemoStoreContext);
  if (!store) throw new Error("useDemoStore must be used inside DemoStoreProvider");
  return store;
}
