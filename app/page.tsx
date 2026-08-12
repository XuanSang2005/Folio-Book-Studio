/* eslint-disable @next/next/no-img-element */
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";

type View = "identity" | "library" | "new" | "studio";
type StepState = "idle" | "running" | "failed" | "stuck";
type DemoOutcome = "normal" | "fail" | "stuck";
type SourceMode = "upload" | "paste";

type Character = {
  name: string;
  role: string;
  prompt: string;
};

type Chapter = {
  name: string;
  prompt: string;
};

type Project = {
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

const STORAGE_KEY = "gradion-folio-prototype-v2";

const STEPS = [
  {
    roman: "I",
    eyebrow: "Art direction",
    label: "Style",
    running: "Reading the manuscript and establishing its visual grammar…",
  },
  {
    roman: "II",
    eyebrow: "The cast",
    label: "Characters",
    running: "Identifying the principal adult cast and writing portrait briefs…",
  },
  {
    roman: "III",
    eyebrow: "Portrait plates",
    label: "Portraits",
    running: "Rendering the character plates, one portrait at a time…",
  },
  {
    roman: "IV",
    eyebrow: "Scene blueprint",
    label: "Chapter",
    running: "Composing one scene brief from the manuscript and established cast…",
  },
  {
    roman: "V",
    eyebrow: "Final plate",
    label: "Illustration",
    running: "Rendering the final plate with portrait references for continuity…",
  },
] as const;

const SAMPLE_TEXT = `The Mole had been working very hard all the morning, spring-cleaning his little home. First with brooms, then with dusters; then on ladders and steps and chairs, with a brush and a pail of whitewash; till he had dust in his throat and eyes, and splashes of whitewash all over his black fur, and an aching back and weary arms.

Spring was moving in the air above and in the earth below and around him, penetrating even his dark and lowly little house with its spirit of divine discontent and longing. It was small wonder, then, that he suddenly flung down his brush on the floor, said “Bother!” and “O blow!” and also “Hang spring-cleaning!” and bolted out of the house without even waiting to put on his coat.

Something up above was calling him imperiously, and he made for the steep little tunnel which answered in his case to the gravelled carriage-drive owned by animals whose residences are nearer to the sun and air. So he scraped and scratched and scrabbled and scrooged, and then he scrooged again and scrabbled and scratched and scraped, working busily with his little paws and muttering to himself, “Up we go! Up we go!” till at last, pop! his snout came out into the sunlight, and he found himself rolling in the warm grass of a great meadow.`;

const SAMPLE_STYLE =
  "Arts & Crafts-era storybook watercolour, with soft ink contours, moss green and weathered ochre, gentle river light, and tactile paper grain.";

const SAMPLE_CHARACTERS: Character[] = [
  {
    name: "Mole",
    role: "The curious homebody",
    prompt:
      "An adult anthropomorphic mole, modest and curious, with velvet-black fur, a cream waistcoat and soil-softened paws; alert dark eyes, a gentle rounded silhouette, and the tentative posture of someone seeing the river for the first time.",
  },
  {
    name: "Ratty",
    role: "The river guide",
    prompt:
      "An adult anthropomorphic water vole, assured and warm, wearing a russet tweed jacket and a river-weathered satchel; silver-brown whiskers, bright observant eyes, and the relaxed bearing of a seasoned boatman.",
  },
];

const SAMPLE_CHAPTER: Chapter = {
  name: "The Riverbank",
  prompt:
    "Mole and Ratty meet beside a luminous spring river. Mole stands in astonishment at the water while Ratty steadies a small blue boat at the bank. Preserve their established portrait features, use the Arts & Crafts watercolour direction, and compose a single borderless scene with no text.",
};

const SEED_PROJECTS: Project[] = [
  {
    id: "riverbank",
    ownerEmail: "sang@example.com",
    volume: "VOL. 02",
    title: "The Wind in the Willows — Riverbank Edition",
    createdAt: "2026-08-08T09:20:00.000Z",
    bookText: SAMPLE_TEXT,
    completedSteps: 4,
    stepState: "idle",
    style: SAMPLE_STYLE,
    characters: SAMPLE_CHARACTERS,
    chapter: SAMPLE_CHAPTER,
    portraitProgress: 2,
  },
  {
    id: "frankenstein",
    ownerEmail: "sang@example.com",
    volume: "VOL. 01",
    title: "Frankenstein — The First Awakening",
    createdAt: "2026-08-06T15:40:00.000Z",
    bookText:
      "It was on a dreary night of November that I beheld the accomplishment of my toils…",
    completedSteps: 5,
    stepState: "idle",
    style:
      "Romantic-era ink wash and engraved shadow, lit by cold laboratory moonlight and restrained copper highlights.",
    characters: [
      {
        name: "Victor Frankenstein",
        role: "The ambitious natural philosopher",
        prompt:
          "An exhausted adult scholar in a dark 1810s waistcoat, hollow-eyed after months of obsessive work, surrounded by anatomical notes and copper instruments.",
      },
      {
        name: "The Creature",
        role: "The abandoned creation",
        prompt:
          "A towering adult figure with grave, searching eyes and carefully stitched features, rendered with dignity rather than horror, wrapped in a weathered dark coat.",
      },
    ],
    chapter: {
      name: "The First Awakening",
      prompt:
        "A cold laboratory at midnight as Victor recoils from the first movement of his creation, with lightning reflected in rain-streaked windows.",
    },
    portraitProgress: 2,
  },
  {
    id: "dorian",
    ownerEmail: "sang@example.com",
    volume: "VOL. 03",
    title: "The Picture of Dorian Gray",
    createdAt: "2026-08-09T11:12:00.000Z",
    bookText:
      "The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden…",
    completedSteps: 0,
    stepState: "idle",
    characters: [],
    portraitProgress: 0,
  },
];

function projectStatus(project: Project) {
  if (project.completedSteps === 0) return "Draft";
  if (project.completedSteps === STEPS.length) return "Done";
  return "In progress";
}

function projectPlateSrc(project: Project) {
  const identity = `${project.id} ${project.title}`.toLowerCase();
  if (identity.includes("frankenstein")) return "/illustrations/frankenstein.webp";
  if (identity.includes("dorian")) return "/illustrations/dorian-gray.webp";
  if (identity.includes("riverbank") || identity.includes("willows")) return "/illustrations/riverbank.webp";
  return "/illustrations/folio-triptych.webp";
}

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default function BookStudioPrototype() {
  const [view, setView] = useState<View>("identity");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState("riverbank");
  const [emptyLibrary, setEmptyLibrary] = useState(false);
  const [manuscriptOpen, setManuscriptOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [artDirection, setArtDirection] = useState("");
  const [demoOutcome, setDemoOutcome] = useState<DemoOutcome>("normal");
  const [prototypePanel, setPrototypePanel] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [mascotPaused, setMascotPaused] = useState(false);
  const [newText, setNewText] = useState("");
  const [fileName, setFileName] = useState("");
  const [newTitleError, setNewTitleError] = useState("");
  const [newManuscriptError, setNewManuscriptError] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceDragActive, setSourceDragActive] = useState(false);
  const [sourceModalError, setSourceModalError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const timersRef = useRef<number[]>([]);
  const modalReturnFocus = useRef<HTMLElement | null>(null);
  const overlayCloseRef = useRef<HTMLButtonElement | null>(null);
  const overlayDialogRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const newTitleInputRef = useRef<HTMLInputElement | null>(null);
  const newTextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sourceDropButtonRef = useRef<HTMLButtonElement | null>(null);
  const sourceReplaceRef = useRef<HTMLButtonElement | null>(null);
  const focusSourceReceiptAfterCloseRef = useRef(false);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects[0],
    [activeProjectId, projects],
  );

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const snapshot = JSON.parse(stored) as {
            projects?: Project[];
            userName?: string;
            userEmail?: string;
            activeProjectId?: string;
            view?: View;
          };
          if (snapshot.projects?.length) {
            setProjects(
              snapshot.projects.map((project) => ({
                ...project,
                ownerEmail: project.ownerEmail ?? "sang@example.com",
              })),
            );
          }
          if (snapshot.userName) setUserName(snapshot.userName);
          if (snapshot.userEmail) setUserEmail(snapshot.userEmail);
          if (snapshot.activeProjectId) setActiveProjectId(snapshot.activeProjectId);
          if (snapshot.view && snapshot.view !== "identity") setView(snapshot.view);
        }
      } catch {
        // A corrupt prototype snapshot simply falls back to the curated seed data.
      }
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ projects, userName, userEmail, activeProjectId, view }),
    );
  }, [activeProjectId, hydrated, projects, userEmail, userName, view]);

  useEffect(() => {
    return () => timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!manuscriptOpen && !lightbox && !sourceModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
        return;
      }
      if (event.key !== "Tab" || !overlayDialogRef.current) return;
      const focusable = Array.from(
        overlayDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not(.source-file-input), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!manuscriptOpen && !lightbox && !sourceModalOpen) return;
    const focusTimer = window.setTimeout(() => {
      if (sourceModalOpen) {
        if (sourceMode === "paste") newTextInputRef.current?.focus();
        else sourceDropButtonRef.current?.focus();
        return;
      }
      overlayCloseRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [lightbox, manuscriptOpen, sourceModalOpen, sourceMode]);

  useEffect(() => {
    if (!manuscriptOpen && !lightbox && !sourceModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightbox, manuscriptOpen, sourceModalOpen]);

  function schedule(callback: () => void, delay: number) {
    timersRef.current.push(window.setTimeout(callback, delay));
  }

  function clearTimers() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }

  function updateProject(id: string, updater: (project: Project) => Project) {
    setProjects((current) =>
      current.map((project) => (project.id === id ? updater(project) : project)),
    );
  }

  function useSampleIdentity() {
    setUserName("Xuan Sang");
    setUserEmail("sang@example.com");
    setIdentityError("");
    setEmptyLibrary(false);
    setView("library");
  }

  function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userName.trim()) {
      setIdentityError("Enter your full name to continue.");
      nameInputRef.current?.focus();
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(userEmail.trim())) {
      setIdentityError("Enter a valid email address to continue.");
      emailInputRef.current?.focus();
      return;
    }
    setIdentityError("");
    setUserName(userName.trim());
    setUserEmail(userEmail.trim().toLowerCase());
    setEmptyLibrary(false);
    setView("library");
  }

  function signOut() {
    clearTimers();
    setView("identity");
    setManuscriptOpen(false);
    setLightbox(null);
    setSourceModalOpen(false);
  }

  function openProject(id: string) {
    setActiveProjectId(id);
    setArtDirection("");
    setView("studio");
  }

  async function readFile(file?: File) {
    if (!file) return false;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setSourceModalError("Please choose a plain .txt manuscript.");
      return false;
    }
    let text = "";
    try {
      text = await file.text();
    } catch {
      setSourceModalError("We could not read that file. Choose another manuscript.");
      return false;
    }
    if (!text.trim()) {
      setSourceModalError("That file is empty. Choose another manuscript.");
      return false;
    }
    setFileName(file.name);
    setNewText(text);
    setSourceModalError("");
    setNewFileError("");
    setNewManuscriptError("");
    return true;
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    void readFile(input.files?.[0]).then((accepted) => {
      input.value = "";
      if (accepted) {
        focusSourceReceiptAfterCloseRef.current = true;
        closeOverlay();
      }
    });
  }

  function onFileDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setSourceDragActive(false);
    if (event.dataTransfer.files.length !== 1) {
      setSourceModalError("Choose one .txt manuscript at a time.");
      return;
    }
    void readFile(event.dataTransfer.files?.[0]).then((accepted) => {
      if (accepted) {
        focusSourceReceiptAfterCloseRef.current = true;
        closeOverlay();
      }
    });
  }

  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const titleMissing = !newTitle.trim();
    const manuscriptMissing = !newText.trim();
    setNewTitleError(titleMissing ? "Give this volume a title." : "");
    setNewManuscriptError(manuscriptMissing ? "Upload or paste a manuscript." : "");
    if (titleMissing) {
      newTitleInputRef.current?.focus();
      return;
    }
    if (newFileError) {
      openSourceModal(null, "upload");
      return;
    }
    if (manuscriptMissing) {
      openSourceModal(null, "upload");
      return;
    }
    const id = `volume-${Date.now()}`;
    const project: Project = {
      id,
      ownerEmail: userEmail.trim().toLowerCase(),
      volume: `VOL. ${String(projects.length + 1).padStart(2, "0")}`,
      title: newTitle.trim(),
      createdAt: new Date().toISOString(),
      bookText: newText.trim(),
      completedSteps: 0,
      stepState: "idle",
      characters: [],
      portraitProgress: 0,
    };
    setProjects((current) => [project, ...current]);
    setActiveProjectId(id);
    setEmptyLibrary(false);
    setNewTitle("");
    setNewText("");
    setFileName("");
    setNewTitleError("");
    setNewManuscriptError("");
    setNewFileError("");
    setView("studio");
  }

  function finishStep(projectId: string, step: number) {
    updateProject(projectId, (project) => {
      const next: Project = {
        ...project,
        completedSteps: Math.max(project.completedSteps, step + 1),
        stepState: "idle",
        error: undefined,
      };
      if (step === 0) {
        next.style = artDirection.trim() || SAMPLE_STYLE;
      }
      if (step === 1) {
        next.characters = SAMPLE_CHARACTERS;
      }
      if (step === 2) {
        next.portraitProgress = 2;
      }
      if (step === 3) {
        next.chapter = SAMPLE_CHAPTER;
      }
      return next;
    });
  }

  function runCurrentStep() {
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project || project.completedSteps >= STEPS.length || project.stepState === "running") {
      return;
    }

    clearTimers();
    const projectId = project.id;
    const step = project.completedSteps;
    const outcome = demoOutcome;
    setDemoOutcome("normal");

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

    if (outcome === "fail") {
      schedule(() => {
        updateProject(projectId, (item) => ({
          ...item,
          stepState: "failed",
          error: `${STEPS[step].label} generation could not be completed. Everything before this stage is safe.`,
        }));
      }, step === 2 ? 1500 : 1100);
      return;
    }

    if (outcome === "stuck") {
      schedule(() => {
        updateProject(projectId, (item) => ({
          ...item,
          stepState: "stuck",
          error: "This generation appears to have been interrupted. No earlier work was lost.",
        }));
      }, step === 2 ? 1500 : 1100);
      return;
    }

    schedule(() => finishStep(projectId, step), step === 2 ? 2100 : 1450);
  }

  function retryStep() {
    updateProject(activeProjectId, (project) => ({
      ...project,
      stepState: "idle",
      error: undefined,
    }));
    schedule(runCurrentStep, 80);
  }

  function recoverStep() {
    clearTimers();
    updateProject(activeProjectId, (project) => ({
      ...project,
      stepState: "idle",
      error: undefined,
    }));
  }

  function restartVolume() {
    clearTimers();
    updateProject(activeProjectId, (project) => ({
      ...project,
      completedSteps: 0,
      stepState: "idle",
      error: undefined,
      style: undefined,
      characters: [],
      chapter: undefined,
      portraitProgress: 0,
    }));
    setArtDirection("");
    setDemoOutcome("normal");
    setPrototypePanel(false);
  }

  function openManuscript(event: React.MouseEvent<HTMLElement>) {
    modalReturnFocus.current = event.currentTarget;
    setManuscriptOpen(true);
  }

  function openSourceModal(event: React.MouseEvent<HTMLElement> | null, mode: SourceMode) {
    modalReturnFocus.current = event?.currentTarget ?? sourceTriggerRef.current;
    setSourceMode(mode);
    setSourceDraft(mode === "paste" && !fileName ? newText : "");
    setSourceDragActive(false);
    setSourceModalError("");
    setSourceModalOpen(true);
  }

  function usePastedSource() {
    const text = sourceDraft.trim();
    if (!text) {
      setSourceModalError("Paste the manuscript text before adding this source.");
      newTextInputRef.current?.focus();
      return;
    }
    setNewText(text);
    setFileName("");
    setSourceModalError("");
    setNewFileError("");
    setNewManuscriptError("");
    focusSourceReceiptAfterCloseRef.current = true;
    closeOverlay();
  }

  function removeSource() {
    setNewText("");
    setFileName("");
    setSourceDraft("");
    setNewFileError("");
    setNewManuscriptError("");
    if (newFileInputRef.current) newFileInputRef.current.value = "";
    window.setTimeout(() => sourceTriggerRef.current?.focus(), 0);
  }

  function openLightbox(label: string, event: React.MouseEvent<HTMLElement>) {
    modalReturnFocus.current = event.currentTarget;
    setLightbox(label);
  }

  function closeOverlay() {
    setManuscriptOpen(false);
    setLightbox(null);
    setSourceModalOpen(false);
    setSourceDragActive(false);
    setSourceModalError("");
    window.setTimeout(() => {
      if (focusSourceReceiptAfterCloseRef.current) {
        focusSourceReceiptAfterCloseRef.current = false;
        sourceReplaceRef.current?.focus();
        return;
      }
      modalReturnFocus.current?.focus();
    }, 0);
  }

  function renderMasthead() {
    return (
      <header className="masthead">
        <button className="wordmark" onClick={() => setView("library")} aria-label="Go to project library">
          <span className="wordmark-prefix">GRADION /</span>
          <span className="wordmark-title">Folio</span>
        </button>
        <nav className="masthead-nav" aria-label="Primary navigation">
          <button className={view === "library" ? "nav-link active" : "nav-link"} onClick={() => setView("library")}>
            Library
          </button>
          <button className={view === "new" ? "nav-link active" : "nav-link"} onClick={() => setView("new")}>
            New volume
          </button>
        </nav>
        <div className="account-block">
          <span className="account-name">{userName}</span>
          <button className="text-link" onClick={signOut}>Sign out</button>
        </div>
      </header>
    );
  }

  function renderIdentity() {
    const nameInvalid = Boolean(identityError && !userName.trim());
    const emailInvalid = Boolean(identityError && !/^\S+@\S+\.\S+$/.test(userEmail.trim()));

    return (
      <main className="login-page">
        <aside className="login-editorial">
          <div className="login-wordmark" aria-label="Gradion Folio">
            <span>GRADION /</span>
            <strong>Folio</strong>
            <small>BOOK ILLUSTRATION STUDIO</small>
          </div>

          <div className="login-story">
            <p className="kicker">FIG. 01 — STUDIO ENTRY</p>
            <h1>
              <span>Return to </span>
              <em>the folio</em>
              <span>.</span>
            </h1>
            <blockquote>
              <p>“The studio remembers every direction, portrait and plate. Return, and the volume continues where you left it.”</p>
              <cite>— EDITORIAL NOTE, VOL. II</cite>
            </blockquote>
            <ol className="login-stage-index" aria-label="Five-stage illustration pipeline">
              {STEPS.map((step) => (
                <li key={step.roman}><b>{step.roman}</b>{step.label}</li>
              ))}
            </ol>
          </div>

          <div className="login-admission-seal" aria-hidden="true">
            <span>STUDIO</span>
            <strong>№ 05</strong>
            <em>est.</em>
            <span>MMXXVI</span>
          </div>
          <div className="login-register-mark register-one" aria-hidden="true"><i /><i /></div>
          <div className="login-register-mark register-two" aria-hidden="true"><i /><i /></div>
        </aside>

        <section className="login-entry">
          <div className="login-entry-inner">
            <p className="kicker">ENTRY FORM · IDENTITY</p>
            <h2>Enter the studio.</h2>
            <p className="login-entry-lede">
              Use your name and email to begin a library or resume an existing volume.
            </p>

            <form className="login-form" onSubmit={submitIdentity} noValidate aria-label="Studio identity">
              <label className="field login-field">
                <span>Full name</span>
                <input
                  ref={nameInputRef}
                  id="studio-name"
                  name="name"
                  value={userName}
                  onChange={(event) => { setUserName(event.target.value); setIdentityError(""); }}
                  autoComplete="name"
                  placeholder="Xuan Sang"
                  required
                  aria-invalid={nameInvalid}
                  aria-describedby={identityError ? "identity-error" : "login-identity-note"}
                />
              </label>
              <label className="field login-field">
                <span>Email</span>
                <input
                  ref={emailInputRef}
                  id="studio-email"
                  name="email"
                  value={userEmail}
                  onChange={(event) => { setUserEmail(event.target.value); setIdentityError(""); }}
                  autoComplete="email"
                  type="email"
                  placeholder="you@domain.com"
                  required
                  aria-invalid={emailInvalid}
                  aria-describedby={identityError ? "identity-error" : "login-identity-note"}
                />
              </label>
              {identityError ? <p className="inline-error" id="identity-error" role="alert">{identityError}</p> : null}
              <button className="primary-button login-submit" type="submit">
                Enter <span aria-hidden="true">→</span>
              </button>
            </form>

            <div className="login-sample">
              <p>Reviewing the prototype?</p>
              <button type="button" onClick={useSampleIdentity}>
                Use the sample library <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>

          <div className="login-entry-footer" id="login-identity-note">
            <span>PROTOTYPE IDENTITY · NO PASSWORD</span>
            <p>New email addresses create a private, empty library. Returning addresses resume saved work.</p>
          </div>
        </section>
      </main>
    );
  }

  function renderLibrary() {
    const visibleProjects = emptyLibrary
      ? []
      : projects.filter((project) => project.ownerEmail === userEmail.trim().toLowerCase());
    const doneCount = visibleProjects.filter((project) => project.completedSteps === 5).length;
    const activeCount = visibleProjects.filter((project) => project.completedSteps > 0 && project.completedSteps < 5).length;

    return (
      <main className="page-shell library-page">
        <section className="library-intro">
          <div className="library-intro-heading">
            <p className="kicker">THE WORKING LIBRARY · {new Date().getFullYear()}</p>
            <h1>Your volumes,<br /><em>in progress.</em></h1>
            <div className="library-intro-action">
              <p>
                Good afternoon, {userName.split(" ")[0]}. Your manuscripts, visual direction,
                cast, and generated plates stay together here.
              </p>
              <button className="primary-button" onClick={() => setView("new")}>Commission a new volume <span aria-hidden="true">→</span></button>
            </div>
          </div>
          <figure className="library-feature-plate">
            <img
              src="/illustrations/riverbank.webp"
              alt="Illustrated Riverbank plate featuring Mole and Ratty beside a blue boat"
              width="486"
              height="976"
              decoding="async"
            />
            <figcaption>PLATE I · THE RIVERBANK</figcaption>
          </figure>
        </section>

        <section className="ledger-summary" aria-label="Library summary">
          <div><span>VOLUMES</span><strong>{String(visibleProjects.length).padStart(2, "0")}</strong></div>
          <div><span>COMPLETE</span><strong>{String(doneCount).padStart(2, "0")}</strong></div>
          <div><span>ACTIVE</span><strong>{String(activeCount).padStart(2, "0")}</strong></div>
          <div><span>PIPELINE</span><strong>V STAGES</strong></div>
        </section>

        {visibleProjects.length ? (
          <section className="project-ledger" aria-label="Your projects">
            <div className="ledger-head">
              <span>VOLUME / TITLE</span>
              <span>PROGRESS</span>
              <span>STATUS</span>
              <span aria-hidden="true">OPEN</span>
            </div>
            {visibleProjects.map((project) => (
              <button className="project-row" key={project.id} onClick={() => openProject(project.id)}>
                <span className="project-title-block">
                  <span className="project-thumbnail" aria-hidden="true">
                    <img src={projectPlateSrc(project)} alt="" width="490" height="976" loading="lazy" decoding="async" />
                    <span>{project.volume}</span>
                  </span>
                  <span>
                    <strong>{project.title}</strong>
                    <small>Created {formatDate(project.createdAt)} · {wordCount(project.bookText).toLocaleString()} words</small>
                  </span>
                </span>
                <span className="project-progress-block">
                  <span className="progress-fraction">{String(project.completedSteps).padStart(2, "0")} / 05</span>
                  <span className="progress-rule" aria-label={`${project.completedSteps} of 5 stages complete`}>
                    {STEPS.map((step, index) => <i key={step.roman} className={index < project.completedSteps ? "filled" : ""} />)}
                  </span>
                  <small>{project.completedSteps === 5 ? "Final plate complete" : `${STEPS[project.completedSteps].label} ${project.completedSteps ? "is next" : "awaits"}`}</small>
                </span>
                <span className={`status-stamp status-${projectStatus(project).toLowerCase().replace(" ", "-")}`}>{projectStatus(project)}</span>
                <span className="row-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </section>
        ) : (
          <section className="empty-library">
            <figure className="empty-plate" aria-hidden="true">
              <img src="/illustrations/folio-triptych.webp" alt="" width="1536" height="1024" loading="lazy" decoding="async" />
            </figure>
            <div>
              <p className="kicker">THE SHELVES ARE WAITING</p>
              <h2>Your first volume begins with a manuscript.</h2>
              <p>Paste the text or upload a plain-text file. The studio will preserve every stage from art direction to final plate.</p>
              <button className="primary-button" onClick={() => setView("new")}>Create your first volume <span aria-hidden="true">→</span></button>
            </div>
          </section>
        )}

        <div className="specimen-switch">
          <span>PROTOTYPE SPECIMEN</span>
          <button className="text-link" onClick={() => setEmptyLibrary((current) => !current)}>
            {emptyLibrary ? "Restore sample library" : "View empty state"}
          </button>
        </div>
      </main>
    );
  }

  function renderNewProject() {
    const sourceWords = wordCount(newText);
    const titleInvalid = Boolean(newTitleError);
    const fileInvalid = Boolean(newFileError);
    const manuscriptInvalid = Boolean(newManuscriptError);
    const manuscriptReady = Boolean(newText.trim() && !newFileError);
    const sourceReady = Boolean(newTitle.trim() && newText.trim() && !newFileError);

    return (
      <main className="page-shell new-project-page">
        <section className="new-project-header">
          <header className="new-project-title">
            <p className="kicker">NEW VOLUME · SOURCE TEXT</p>
            <h1>Begin a <em>new volume.</em></h1>
          </header>
          <figure className="new-project-proof">
            <div
              className="new-project-proof-grid"
              role="img"
              aria-label="Five ornate reference plates showing a riverbank story, a gothic laboratory, a Victorian portrait studio, a moonlit observatory, and a botanical conservatory"
            >
              <div className="proof-card proof-card-one">
                <span className="proof-art" aria-hidden="true" />
                <span className="proof-label"><b>I</b> Riverbank study</span>
              </div>
              <div className="proof-card proof-card-two">
                <span className="proof-art" aria-hidden="true" />
                <span className="proof-label"><b>II</b> Gothic study</span>
              </div>
              <div className="proof-card proof-card-three">
                <span className="proof-art" aria-hidden="true" />
                <span className="proof-label"><b>III</b> Portrait study</span>
              </div>
              <div className="proof-card proof-card-four">
                <span className="proof-art" aria-hidden="true" />
                <span className="proof-label"><b>IV</b> Observatory study</span>
              </div>
              <div className="proof-card proof-card-five">
                <span className="proof-art" aria-hidden="true" />
                <span className="proof-label"><b>V</b> Botanical study</span>
              </div>
            </div>
            <figcaption><span>REFERENCE PROOF</span><strong>PLATES I–V · VISUAL RANGE</strong></figcaption>
          </figure>
        </section>

        <form className="commission-form" onSubmit={createProject} noValidate>
          <section className="commission-desk" aria-labelledby="commission-desk-heading">
            <header className="commission-desk-header">
              <div>
                <p className="kicker">COMMISSION DESK · SOURCE 01</p>
                <h2 id="commission-desk-heading">Name the edition. <em>Attach its one source.</em></h2>
              </div>
              <p>Two details begin the studio: a working title and the complete manuscript. Both remain editable until the volume is created.</p>
            </header>

            <div className="commission-input-grid">
              <section className="commission-panel title-panel" aria-labelledby="commission-title-heading">
                <div className="commission-panel-index"><span>01</span><small>VOLUME</small></div>
                <div className="commission-panel-body">
                  <p className="kicker" id="commission-title-heading">NAME THE EDITION</p>
                  <div className="field field-large title-field">
                    <label htmlFor="new-volume-title">Volume title</label>
                    <span className={`title-input-row${titleInvalid ? " invalid" : ""}`}>
                      <input
                        ref={newTitleInputRef}
                        id="new-volume-title"
                        name="volumeTitle"
                        required
                        aria-invalid={titleInvalid}
                        aria-describedby={titleInvalid ? "new-title-error" : "volume-title-note"}
                        value={newTitle}
                        onChange={(event) => { setNewTitle(event.target.value); if (newTitleError) setNewTitleError(""); }}
                        placeholder="The Secret Garden — Illustrated Edition"
                      />
                      {!newTitle ? (
                        <span className="title-mascot-controls">
                          <picture className="title-field-mascot" id="volume-title-mascot">
                            {!mascotPaused ? (
                              <source
                                srcSet="/illustrations/folio-mascot-loop.webp"
                                type="image/webp"
                                media="(prefers-reduced-motion: no-preference)"
                              />
                            ) : null}
                            <img
                              src="/illustrations/folio-mascot.png"
                              alt=""
                              aria-hidden="true"
                              width="109"
                              height="144"
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                            />
                          </picture>
                          <button
                            type="button"
                            className="mascot-motion-toggle"
                            aria-controls="volume-title-mascot"
                            aria-label={mascotPaused ? "Play mascot animation" : "Pause mascot animation"}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setMascotPaused((paused) => !paused);
                            }}
                          >
                            <span aria-hidden="true">{mascotPaused ? "▶" : "Ⅱ"}</span>
                          </button>
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <p className="panel-note" id="volume-title-note">Use the title that should appear in your working library.</p>
                  {titleInvalid ? <p className="inline-error" id="new-title-error" role="alert">{newTitleError}</p> : null}
                </div>
              </section>

              <section className="commission-panel source-panel" aria-labelledby="commission-source-heading">
                <div className="commission-panel-index"><span>02</span><small>SOURCE</small></div>
                <div className="commission-panel-body">
                  <p className="kicker" id="commission-source-heading">SOURCE MANUSCRIPT · TXT / UTF-8</p>
                  {manuscriptReady ? (
                    <div className="source-receipt">
                      <span className="source-receipt-mark" aria-hidden="true">TXT</span>
                      <span className="source-receipt-copy">
                        <small>SOURCE READY</small>
                        <strong>{fileName || "Pasted manuscript"}</strong>
                        <span role="status" aria-live="polite" aria-label={`${fileName || "Pasted manuscript"}, ${sourceWords.toLocaleString()} words, source ready`}>{sourceWords.toLocaleString()} words · uploaded once</span>
                      </span>
                      <span className="source-receipt-actions">
                        <button
                          ref={sourceReplaceRef}
                          type="button"
                          aria-haspopup="dialog"
                          aria-controls="source-dialog"
                          onClick={(event) => openSourceModal(event, fileName ? "upload" : "paste")}
                        >Replace</button>
                        <button type="button" onClick={removeSource}>Remove</button>
                      </span>
                    </div>
                  ) : (
                    <div className="source-empty-state">
                      <div>
                        <strong>No manuscript attached.</strong>
                        <p>Upload once. Folio carries the same source through every stage.</p>
                      </div>
                      <button
                        ref={sourceTriggerRef}
                        className="source-upload-trigger"
                        type="button"
                        aria-haspopup="dialog"
                        aria-controls="source-dialog"
                        aria-describedby={fileInvalid ? "new-file-error" : manuscriptInvalid ? "new-manuscript-error" : undefined}
                        onClick={(event) => openSourceModal(event, "upload")}
                      >
                        <span>Upload manuscript</span><span aria-hidden="true">↗</span>
                      </button>
                      <button className="source-paste-trigger" type="button" aria-haspopup="dialog" aria-controls="source-dialog" onClick={(event) => openSourceModal(event, "paste")}>Paste text instead</button>
                    </div>
                  )}
                  {fileInvalid && !sourceModalOpen ? <p className="inline-error" id="new-file-error" role="alert">{newFileError}</p> : null}
                  {manuscriptInvalid ? <p className="inline-error" id="new-manuscript-error" role="alert">{newManuscriptError}</p> : null}
                </div>
              </section>
            </div>

            <section className="pipeline-ledger" aria-labelledby="pipeline-ledger-heading">
              <header>
                <div><p className="kicker">THE EDITION PIPELINE</p><h3 id="pipeline-ledger-heading">One source becomes five deliberate stages.</h3></div>
                <p>UPLOADED ONCE · MANUAL RETRIES</p>
              </header>
              <ol>
                {STEPS.map((step) => (
                  <li key={step.roman}>
                    <span>{step.roman}</span>
                    <p><strong>{step.eyebrow}</strong><small>{step.label}</small></p>
                  </li>
                ))}
              </ol>
            </section>

            <div className="commission-actions">
              <div className={sourceReady ? "commission-readiness ready" : "commission-readiness"}>
                <span>{sourceReady ? "COMMISSION READY" : "COMMISSION INCOMPLETE"}</span>
                <p>{sourceReady ? `${sourceWords.toLocaleString()} words prepared · ready to enter Stage I` : "Add the title and manuscript to open this commission."}</p>
              </div>
              <button className={sourceReady ? "primary-button commission-submit ready" : "primary-button commission-submit"} type="submit">Create this volume <span aria-hidden="true">→</span></button>
            </div>
          </section>
        </form>
      </main>
    );
  }

  function renderPortrait(character: Character, index: number, project: Project) {
    const ready = project.completedSteps > 2 || project.portraitProgress > index;
    const generating =
      project.completedSteps === 2 &&
      project.stepState === "running" &&
      !ready &&
      index === project.portraitProgress;
    return (
      <article className="portrait-card" key={character.name}>
        <button
          className={`portrait-art portrait-${index + 1} ${ready ? "ready" : "pending"}`}
          onClick={(event) => ready && openLightbox(`${character.name} · Portrait plate ${index + 1}`, event)}
          disabled={!ready}
          aria-label={ready ? `Open portrait of ${character.name}` : `${character.name} portrait not generated yet`}
        >
          {ready ? (
            <img
              className="portrait-image"
              src={index === 0 ? "/illustrations/mole-portrait.webp" : "/illustrations/ratty-portrait.webp"}
              alt={`Illustrated portrait of ${character.name}`}
              width="220"
              height="330"
              loading="lazy"
              decoding="async"
            />
          ) : null}
          {generating ? <span className="press-loader"><i />Rendering plate {STEPS[index].roman}</span> : null}
          {!ready && !generating ? <span className="not-generated">PLATE AWAITS</span> : null}
        </button>
        <div className="plate-meta"><span>PLATE {index === 0 ? "I" : "II"}</span><span>{ready ? "GENERATED" : generating ? "IN PRESS" : "PENDING"}</span></div>
        <h3>{character.name}</h3>
        <p className="role-line">{character.role}</p>
        <details><summary>Portrait brief</summary><p>{character.prompt}</p></details>
      </article>
    );
  }

  function renderStudio() {
    if (!activeProject) return null;
    const currentIndex = Math.min(activeProject.completedSteps, STEPS.length - 1);
    const currentStep = activeProject.completedSteps < STEPS.length ? STEPS[currentIndex] : null;
    const running = activeProject.stepState === "running";
    const showCharacters = activeProject.completedSteps >= 2 || (activeProject.completedSteps === 1 && running);
    const showChapter = activeProject.completedSteps >= 4;
    const complete = activeProject.completedSteps === STEPS.length;

    return (
      <main className="page-shell studio-page">
        <div className="studio-return-row">
          <button className="back-link" onClick={() => setView("library")}>← Return to the library</button>
          <button className="secondary-button" onClick={openManuscript}>Read full manuscript</button>
        </div>

        <header className="project-heading">
          <div className="volume-monogram"><span>{activeProject.volume.replace("VOL. ", "")}</span><small>VOLUME</small></div>
          <div>
            <p className="kicker">ACTIVE COMMISSION · {projectStatus(activeProject).toUpperCase()}</p>
            <h1>{activeProject.title}</h1>
            <p className="project-byline">Created {formatDate(activeProject.createdAt)} · {userName} · {wordCount(activeProject.bookText).toLocaleString()} words</p>
          </div>
          <span className={`status-stamp status-${projectStatus(activeProject).toLowerCase().replace(" ", "-")}`}>{projectStatus(activeProject)}</span>
        </header>

        <ol className="studio-stepper" aria-label="Illustration pipeline">
          {STEPS.map((step, index) => {
            const done = index < activeProject.completedSteps;
            const current = index === activeProject.completedSteps;
            const state = done ? "complete" : current ? activeProject.stepState : "pending";
            return (
              <li key={step.roman} className={`${done ? "done" : current ? "current" : "pending"} ${state}`} aria-current={current ? "step" : undefined}>
                <span className="step-roman">{done ? "✓" : step.roman}</span>
                <span><small>{step.eyebrow}</small><strong>{step.label}</strong></span>
                <em>{done ? "COMPLETE" : current ? activeProject.stepState === "idle" ? "READY" : activeProject.stepState.toUpperCase() : "PENDING"}</em>
              </li>
            );
          })}
        </ol>

        <div className="studio-grid">
          <section className="studio-workbench">
            <div className={`action-panel action-${activeProject.stepState}`} aria-live="polite">
              <div className="action-index">{complete ? "✓" : `0${currentIndex + 1}`}</div>
              <div className="action-content">
                {complete ? (
                  <>
                    <p className="kicker">VOLUME COMPLETE · ALL FIVE STAGES</p>
                    <h2>The final plate is in the folio.</h2>
                    <p>Every result is preserved. Reopening this project will never regenerate work automatically.</p>
                  </>
                ) : activeProject.stepState === "failed" ? (
                  <>
                    <p className="kicker danger-copy">STAGE NEEDS ATTENTION</p>
                    <h2>{currentStep?.label} could not be completed.</h2>
                    <p>{activeProject.error}</p>
                    <button className="primary-button" onClick={retryStep}>Retry {currentStep?.label} <span aria-hidden="true">↻</span></button>
                  </>
                ) : activeProject.stepState === "stuck" ? (
                  <>
                    <p className="kicker warning-copy">INTERRUPTED REQUEST</p>
                    <h2>This stage has stopped responding.</h2>
                    <p>{activeProject.error} Recovering only clears the abandoned lease; it does not touch completed artifacts.</p>
                    <button className="primary-button" onClick={recoverStep}>Recover this stage <span aria-hidden="true">→</span></button>
                  </>
                ) : running ? (
                  <>
                    <p className="kicker">STAGE {currentStep?.roman} · IN PRESS</p>
                    <h2>{currentStep?.running}</h2>
                    <div className="press-progress"><i /><span>Gemini request in flight · duplicate execution locked</span></div>
                    {currentIndex === 2 ? <p className="item-progress">Portrait plates complete: {activeProject.portraitProgress} / 2</p> : null}
                  </>
                ) : (
                  <>
                    <p className="kicker">READY FOR STAGE {currentStep?.roman} · {currentStep?.eyebrow.toUpperCase()}</p>
                    <h2>{currentIndex === 0 ? "Establish the visual grammar." : `Generate ${currentStep?.label.toLowerCase()}.`}</h2>
                    <p>{currentIndex === 0 ? "Set an optional art direction, or leave it blank and let Gemini propose one from the manuscript." : "This action runs only the current stage. Completed work remains untouched."}</p>
                    {currentIndex === 0 ? (
                      <label className="field action-field"><span>Art direction (optional)</span><input value={artDirection} onChange={(event) => setArtDirection(event.target.value)} placeholder="e.g. Arts & Crafts watercolour, soft ink contours…" /></label>
                    ) : null}
                    <button className="primary-button" onClick={runCurrentStep}>Generate {currentStep?.label} <span aria-hidden="true">→</span></button>
                  </>
                )}
              </div>
            </div>

            {showChapter ? (
              <section className="artifact-section chapter-section">
                <div className="section-heading-row"><div><p className="kicker">SCENE BLUEPRINT · 1 OF 1 SLOT USED</p><h2>{activeProject.chapter?.name ?? SAMPLE_CHAPTER.name}</h2></div><span>CHAPTER PLATE</span></div>
                <button className={`chapter-art ${complete ? "ready" : "waiting"}`} onClick={(event) => complete && openLightbox(`${activeProject.chapter?.name ?? SAMPLE_CHAPTER.name} · Final illustration`, event)} disabled={!complete}>
                  <img className="chapter-image" src={projectPlateSrc(activeProject)} alt="" width="490" height="976" loading="lazy" decoding="async" />
                  {!complete ? <span className="chapter-awaits">FINAL PLATE AWAITS STAGE V</span> : <span className="chapter-ready-label">FINAL PLATE · {(activeProject.chapter?.name ?? SAMPLE_CHAPTER.name).toUpperCase()}</span>}
                </button>
                <p className="chapter-prompt">{activeProject.chapter?.prompt ?? SAMPLE_CHAPTER.prompt}</p>
              </section>
            ) : null}

            {showCharacters && activeProject.characters.length ? (
              <section className="artifact-section">
                <div className="section-heading-row"><div><p className="kicker">THE CAST · 2 OF 2 SLOTS USED</p><h2>Principal characters</h2></div><span>ADULT CAST ONLY</span></div>
                <div className="portrait-grid">
                  {activeProject.characters.slice(0, 2).map((character, index) => renderPortrait(character, index, activeProject))}
                </div>
              </section>
            ) : null}
          </section>

          <aside className="studio-notes">
            <section className="note-card style-note">
              <p className="kicker">ART DIRECTION</p>
              <h3>{activeProject.style ? "The visual grammar" : "Not yet established"}</h3>
              <p>{activeProject.style ?? "Stage I will create a reusable style instruction for every prompt and image that follows."}</p>
            </section>
            <section className="note-card source-note">
              <div className="note-card-head"><p className="kicker">SOURCE MANUSCRIPT</p><span>{wordCount(activeProject.bookText).toLocaleString()} WORDS</span></div>
              <blockquote>“{activeProject.bookText.replace(/\s+/g, " ").slice(0, 238)}…”</blockquote>
              <button className="text-link" onClick={openManuscript}>Read the complete text →</button>
            </section>
            <section className="note-card context-note">
              <span className="context-mark" aria-hidden="true">◆</span>
              <p className="kicker">CONTEXT & COST</p>
              <h3>Uploaded once. Reused throughout.</h3>
              <p>The production app chains context between stages, enforces 2 character / 1 chapter caps server-side, and never auto-retries.</p>
            </section>
            <section className="prototype-controls">
              <button className="prototype-controls-toggle" onClick={() => setPrototypePanel((current) => !current)} aria-expanded={prototypePanel}>
                <span>PROTOTYPE CONTROLS</span><span>{prototypePanel ? "−" : "+"}</span>
              </button>
              {prototypePanel ? (
                <div className="prototype-controls-body">
                  <p>Choose the outcome of the next generation to inspect required states.</p>
                  <div className="outcome-options">
                    {(["normal", "fail", "stuck"] as DemoOutcome[]).map((outcome) => (
                      <button key={outcome} className={demoOutcome === outcome ? "selected" : ""} onClick={() => setDemoOutcome(outcome)}>{outcome === "normal" ? "Normal" : outcome === "fail" ? "Fail next" : "Interrupt next"}</button>
                    ))}
                  </div>
                  <button className="text-link danger-link" onClick={restartVolume}>Restart this volume at Stage I</button>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <div className="folio-app">
      {view === "identity" ? renderIdentity() : (
        <>
          {renderMasthead()}
          {view === "library" ? renderLibrary() : null}
          {view === "new" ? renderNewProject() : null}
          {view === "studio" ? renderStudio() : null}
          <footer className="site-footer"><span>GRADION / FOLIO</span><span>INTERACTIVE UI PROTOTYPE · GEMINI CALLS ARE SIMULATED</span><span>MMXXVI</span></footer>
        </>
      )}

      {sourceModalOpen ? (
        <div className="modal-backdrop source-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeOverlay()}>
          <section
            ref={overlayDialogRef}
            id="source-dialog"
            className="source-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-dialog-title"
            aria-describedby="source-dialog-description"
          >
            <header className="source-modal-header">
              <div>
                <p className="kicker">ADD SOURCE · TXT ONLY</p>
                <h2 id="source-dialog-title">Bring in the manuscript.</h2>
                <p id="source-dialog-description">Choose one complete plain-text source. It will be carried through all five illustration stages.</p>
              </div>
              <button ref={overlayCloseRef} className="modal-close" type="button" onClick={closeOverlay} aria-label="Close add manuscript dialog">×</button>
            </header>

            <div className="source-modal-stage">
              {sourceMode === "upload" ? (
                <>
                  <input
                    ref={newFileInputRef}
                    className="source-file-input"
                    type="file"
                    tabIndex={-1}
                    name="manuscriptFile"
                    accept=".txt,text/plain"
                    aria-invalid={Boolean(sourceModalError)}
                    aria-describedby={sourceModalError ? "source-modal-file-error" : "source-upload-help"}
                    onChange={onFileChange}
                  />
                  <button
                    ref={sourceDropButtonRef}
                    className={sourceDragActive ? "source-drop-zone dragging" : "source-drop-zone"}
                    type="button"
                    onClick={() => newFileInputRef.current?.click()}
                    onDragEnter={(event) => { event.preventDefault(); setSourceDragActive(true); }}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setSourceDragActive(true); }}
                    onDragLeave={() => setSourceDragActive(false)}
                    onDrop={onFileDrop}
                    aria-describedby={sourceModalError ? "source-modal-file-error" : "source-upload-help"}
                  >
                    <span className="source-drop-icon" aria-hidden="true">↑</span>
                    <span className="source-drop-copy">
                      <strong>Choose a .txt manuscript</strong>
                      <small id="source-upload-help">or drop it here · plain text · UTF-8</small>
                    </span>
                    <span className="source-drop-action">Browse files</span>
                  </button>
                  {sourceModalError ? <p className="inline-error source-modal-error" id="source-modal-file-error" role="alert">{sourceModalError}</p> : null}
                  {fileName ? <p className="source-current-status">Current source: {fileName} · {wordCount(newText).toLocaleString()} words</p> : null}
                </>
              ) : (
                <div className="source-text-panel">
                  <div className="source-text-heading">
                    <label htmlFor="source-manuscript-text">Paste the complete manuscript</label>
                    <span>{wordCount(sourceDraft).toLocaleString()} words</span>
                  </div>
                  <textarea
                    ref={newTextInputRef}
                    id="source-manuscript-text"
                    rows={12}
                    value={sourceDraft}
                    aria-invalid={Boolean(sourceModalError)}
                    aria-describedby={sourceModalError ? "source-modal-text-error" : "source-text-help"}
                    onChange={(event) => {
                      setSourceDraft(event.target.value);
                      if (sourceModalError) setSourceModalError("");
                      if (newFileError) setNewFileError("");
                    }}
                    placeholder="Paste the manuscript…"
                  />
                  <div className="source-text-meta"><span id="source-text-help">PLAIN TEXT · UTF-8</span><span>ONE COMPLETE SOURCE</span></div>
                  {sourceModalError ? <p className="inline-error source-modal-error" id="source-modal-text-error" role="alert">{sourceModalError}</p> : null}
                  <button className="primary-button source-use-text" type="button" onClick={usePastedSource}>Use pasted text <span aria-hidden="true">→</span></button>
                </div>
              )}
            </div>

            <footer className="source-modal-methods" aria-label="Manuscript source method">
              <button
                className={sourceMode === "upload" ? "source-method selected" : "source-method"}
                type="button"
                aria-pressed={sourceMode === "upload"}
                onClick={() => {
                  setSourceMode("upload");
                  setNewManuscriptError("");
                  setSourceModalError("");
                  window.setTimeout(() => newFileInputRef.current?.click(), 0);
                }}
              ><span aria-hidden="true">↑</span><strong>Upload .txt</strong><small>From this device</small></button>
              <button
                className={sourceMode === "paste" ? "source-method selected" : "source-method"}
                type="button"
                aria-pressed={sourceMode === "paste"}
                onClick={() => {
                  setSourceMode("paste");
                  setNewFileError("");
                  setSourceModalError("");
                  window.setTimeout(() => newTextInputRef.current?.focus(), 0);
                }}
              ><span aria-hidden="true">¶</span><strong>Text input</strong><small>Paste the manuscript</small></button>
              <button className="source-modal-cancel" type="button" onClick={closeOverlay}>Cancel</button>
            </footer>
          </section>
        </div>
      ) : null}

      {manuscriptOpen && activeProject ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeOverlay()}>
          <section ref={overlayDialogRef} className="manuscript-modal" role="dialog" aria-modal="true" aria-labelledby="manuscript-title">
            <header><div><p className="kicker">SOURCE MANUSCRIPT · READ-ONLY</p><h2 id="manuscript-title">{activeProject.title}</h2></div><button ref={overlayCloseRef} className="modal-close" onClick={closeOverlay} aria-label="Close manuscript">×</button></header>
            <div className="manuscript-copy"><span className="drop-cap">{activeProject.bookText.trim()[0]}</span>{activeProject.bookText.trim().slice(1)}</div>
            <footer><span>{wordCount(activeProject.bookText).toLocaleString()} WORDS</span><span>FULL TEXT REMAINS AVAILABLE AT EVERY STAGE</span></footer>
          </section>
        </div>
      ) : null}

      {lightbox ? (
        <div className="modal-backdrop lightbox-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeOverlay()}>
          <section ref={overlayDialogRef} className="lightbox" role="dialog" aria-modal="true" aria-label={lightbox}>
            <button ref={overlayCloseRef} className="modal-close lightbox-close" onClick={closeOverlay} aria-label="Close image">×</button>
            <div className={lightbox.includes("Final") ? "lightbox-image-frame final" : "lightbox-image-frame portrait"}>
              <img
                src={lightbox.includes("Final") && activeProject
                  ? projectPlateSrc(activeProject)
                  : lightbox.includes("Ratty")
                    ? "/illustrations/ratty-portrait.webp"
                    : "/illustrations/mole-portrait.webp"}
                alt={lightbox}
                width="490"
                height="976"
                decoding="async"
              />
            </div>
            <p>{lightbox}</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
