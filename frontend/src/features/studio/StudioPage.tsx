import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { AppChrome } from "../../components/layout/AppChrome";
import { useDemoStore } from "../../lib/demo-store/DemoStore";
import {
  SAMPLE_CHAPTER,
  STEPS,
  projectPlateSrc,
  wordCount,
} from "../../lib/demo-store/data";
import { PortraitCard } from "./PortraitCard";
import { StudioDialogs } from "./StudioDialogs";

export function StudioPage({ volumeId }: { volumeId: string }) {
  const navigate = useNavigate();
  const {
    projects,
    artDirection,
    setArtDirection,
    setActiveProjectId,
    runCurrentStep,
    retryStep,
    recoverStep,
  } = useDemoStore();
  const [manuscriptOpen, setManuscriptOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const modalReturnFocus = useRef<HTMLElement | null>(null);
  const overlayCloseRef = useRef<HTMLButtonElement | null>(null);
  const overlayDialogRef = useRef<HTMLElement | null>(null);
  const project = projects.find((candidate) => candidate.id === volumeId);
  const projectExists = Boolean(project);

  useEffect(() => {
    if (!projectExists) {
      void navigate({ to: "/library", replace: true });
      return;
    }
    setActiveProjectId(volumeId);
  }, [navigate, projectExists, setActiveProjectId, volumeId]);

  const closeOverlay = useCallback(() => {
    setManuscriptOpen(false);
    setLightbox(null);
    window.setTimeout(() => modalReturnFocus.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!manuscriptOpen && !lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
        return;
      }
      if (event.key !== "Tab" || !overlayDialogRef.current) return;
      const focusable = Array.from(
        overlayDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [closeOverlay, lightbox, manuscriptOpen]);

  useEffect(() => {
    if (!manuscriptOpen && !lightbox) return;
    const focusTimer = window.setTimeout(() => overlayCloseRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [lightbox, manuscriptOpen]);

  useEffect(() => {
    if (!manuscriptOpen && !lightbox) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightbox, manuscriptOpen]);

  if (!project) return null;

  function openManuscript(event: MouseEvent<HTMLElement>) {
    modalReturnFocus.current = event.currentTarget;
    setManuscriptOpen(true);
  }

  function openLightbox(label: string, event: MouseEvent<HTMLElement>) {
    modalReturnFocus.current = event.currentTarget;
    setLightbox(label);
  }

  const currentIndex = Math.min(project.completedSteps, STEPS.length - 1);
  const currentStep = project.completedSteps < STEPS.length ? STEPS[currentIndex] : null;
  const running = project.stepState === "running";
  const showCharacters = project.completedSteps >= 2 || (project.completedSteps === 1 && running);
  const showChapter = project.completedSteps >= 4;
  const complete = project.completedSteps === STEPS.length;
  const studioStateLabel = complete
    ? "All five illustration stages complete"
    : project.stepState === "failed"
      ? `Stage ${currentStep?.roman} failed`
      : project.stepState === "stuck"
        ? `Stage ${currentStep?.roman} interrupted`
        : running
          ? `Stage ${currentStep?.roman} in progress`
          : `Stage ${currentStep?.roman} ready`;

  return (
    <AppChrome view="studio">
      <main className="page-shell studio-page mx-auto">
        <h1 className="visually-hidden">{project.title} · Illustration studio</h1>
        <nav className="studio-progress" aria-label="Illustration pipeline progress">
          <div className="studio-progress-heading">
            <span>EDITION PIPELINE</span>
            <strong>{studioStateLabel}</strong>
          </div>
          <ol className="studio-stepper">
            {STEPS.map((step, index) => {
              const done = index < project.completedSteps;
              const current = index === project.completedSteps;
              const state = done ? "complete" : current ? project.stepState : "pending";
              const visibleState = done
                ? "Complete"
                : current
                  ? project.stepState === "idle" ? "Ready" : project.stepState
                  : "Pending";
              return (
                <li
                  key={step.roman}
                  className={`${done ? "done" : current ? "current" : "pending"} ${state}`}
                  aria-current={current ? "step" : undefined}
                  aria-label={`Step ${index + 1} of 5, ${step.label}, ${visibleState}`}
                >
                  <span className="step-roman">{done ? "✓" : step.roman}</span>
                  <span><small>{step.eyebrow}</small><strong>{step.label}</strong></span>
                  <em>{visibleState.toUpperCase()}</em>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="studio-grid">
          <section className="studio-workbench">
            <div className={`action-panel action-${project.stepState}`} aria-busy={running}>
              <div className="action-index">{complete ? "✓" : `0${currentIndex + 1}`}</div>
              <div className="action-content">
                {complete ? (
                  <>
                    <p className="kicker">VOLUME COMPLETE · ALL FIVE STAGES</p>
                    <h2>The final plate is in the folio.</h2>
                    <p>Every result is preserved. Reopening this project will never regenerate work automatically.</p>
                  </>
                ) : project.stepState === "failed" ? (
                  <>
                    <p className="kicker danger-copy">STAGE NEEDS ATTENTION</p>
                    <h2>{currentStep?.label} could not be completed.</h2>
                    <p>{project.error}</p>
                    <button className="primary-button" onClick={() => retryStep(project.id)}>
                      Retry {currentStep?.label} <span aria-hidden="true">↻</span>
                    </button>
                  </>
                ) : project.stepState === "stuck" ? (
                  <>
                    <p className="kicker warning-copy">INTERRUPTED REQUEST</p>
                    <h2>This stage has stopped responding.</h2>
                    <p>
                      {project.error} Recovering only clears the abandoned lease; it does not touch completed artifacts.
                    </p>
                    <button className="primary-button" onClick={() => recoverStep(project.id)}>
                      Recover this stage <span aria-hidden="true">→</span>
                    </button>
                  </>
                ) : running ? (
                  <>
                    <p className="kicker">STAGE {currentStep?.roman} · IN PRESS</p>
                    <h2>{currentStep?.running}</h2>
                    <div className="press-progress">
                      <i /><span>Gemini request in flight · duplicate execution locked</span>
                    </div>
                    {currentIndex === 2 ? (
                      <p className="item-progress">Portrait plates complete: {project.portraitProgress} / 2</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="kicker">
                      READY FOR STAGE {currentStep?.roman} · {currentStep?.eyebrow.toUpperCase()}
                    </p>
                    <h2>
                      {currentIndex === 0
                        ? "Establish the visual grammar."
                        : `Generate ${currentStep?.label.toLowerCase()}.`}
                    </h2>
                    <p>
                      {currentIndex === 0
                        ? "Set an optional art direction, or leave it blank and let Gemini propose one from the manuscript."
                        : "This action runs only the current stage. Completed work remains untouched."}
                    </p>
                    {currentIndex === 0 ? (
                      <label className="field action-field">
                        <span>Art direction (optional)</span>
                        <input
                          value={artDirection}
                          onChange={(event) => setArtDirection(event.target.value)}
                          placeholder="e.g. Arts & Crafts watercolour, soft ink contours…"
                        />
                      </label>
                    ) : null}
                    <button className="primary-button" onClick={() => runCurrentStep(project.id)}>
                      Generate {currentStep?.label} <span aria-hidden="true">→</span>
                    </button>
                  </>
                )}
              </div>
              <p
                className="studio-live-status"
                role={project.stepState === "failed" ? "alert" : "status"}
                aria-live={project.stepState === "failed" ? "assertive" : "polite"}
                aria-atomic="true"
              >
                {studioStateLabel}
              </p>
            </div>

            {showChapter ? (
              <section className="artifact-section chapter-section">
                <div className="section-heading-row">
                  <div>
                    <p className="kicker">SCENE BLUEPRINT · 1 OF 1 SLOT USED</p>
                    <h2>{project.chapter?.name ?? SAMPLE_CHAPTER.name}</h2>
                  </div>
                  <span>CHAPTER PLATE</span>
                </div>
                <div className="chapter-folio-card">
                  <button
                    className={`chapter-art ${complete ? "ready" : "waiting"}`}
                    aria-label={complete
                      ? `Open final illustration for ${project.chapter?.name ?? SAMPLE_CHAPTER.name}`
                      : "Final illustration awaits Stage V"}
                    onClick={(event) => complete
                      && openLightbox(`${project.chapter?.name ?? SAMPLE_CHAPTER.name} · Final illustration`, event)}
                    disabled={!complete}
                  >
                    <img
                      className="chapter-image"
                      src={projectPlateSrc(project)}
                      alt=""
                      width="490"
                      height="976"
                      loading="lazy"
                      decoding="async"
                    />
                    {!complete ? (
                      <span className="chapter-awaiting" aria-hidden="true">
                        <i>V</i><strong>Final illustration</strong><small>Awaits Stage V</small>
                      </span>
                    ) : (
                      <span className="chapter-ready-label">
                        FINAL PLATE · {(project.chapter?.name ?? SAMPLE_CHAPTER.name).toUpperCase()}
                      </span>
                    )}
                  </button>
                  <div className="chapter-brief">
                    <div className="chapter-brief-meta">
                      <span>SCENE 01</span><span>{complete ? "GENERATED" : "BLUEPRINT READY"}</span>
                    </div>
                    <p className="kicker">ILLUSTRATION BRIEF</p>
                    <h3>Compose the final plate.</h3>
                    <p className="chapter-prompt">{project.chapter?.prompt ?? SAMPLE_CHAPTER.prompt}</p>
                    <div className="chapter-brief-foot">
                      <span>CAST {String(Math.min(project.characters.length, 2)).padStart(2, "0")}</span>
                      <span>SCENE 01</span>
                      <span>{complete ? "PLATE READY" : "PLATE PENDING"}</span>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {showCharacters && project.characters.length ? (
              <section className="artifact-section">
                <div className="section-heading-row">
                  <div>
                    <p className="kicker">THE CAST · 2 OF 2 SLOTS USED</p>
                    <h2>Principal characters</h2>
                  </div>
                  <span>ADULT CAST ONLY</span>
                </div>
                <div className="portrait-grid">
                  {project.characters.slice(0, 2).map((character, index) => (
                    <PortraitCard
                      key={character.name}
                      character={character}
                      index={index}
                      project={project}
                      openLightbox={openLightbox}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </section>

          <aside className="studio-notes" aria-labelledby="project-reference-title">
            <h2 className="visually-hidden" id="project-reference-title">Project reference</h2>
            <section className="note-card style-note">
              <p className="kicker">ART DIRECTION</p>
              <h3>{project.style ? "The visual grammar" : "Not yet established"}</h3>
              <p>
                {project.style
                  ?? "Stage I will create a reusable style instruction for every prompt and image that follows."}
              </p>
            </section>
            <section className="note-card source-note">
              <div className="note-card-head">
                <p className="kicker">SOURCE MANUSCRIPT</p>
                <span>{wordCount(project.bookText).toLocaleString()} WORDS</span>
              </div>
              <blockquote>“{project.bookText.replace(/\s+/g, " ").slice(0, 238)}…”</blockquote>
              <button className="text-link" onClick={openManuscript}>Read the complete text →</button>
            </section>
            <section className="note-card context-note">
              <span className="context-mark" aria-hidden="true">◆</span>
              <p className="kicker">CONTEXT & COST</p>
              <h3>Uploaded once. Reused throughout.</h3>
              <p>
                The production app chains context between stages, enforces 2 character / 1 chapter caps server-side, and never auto-retries.
              </p>
            </section>
          </aside>
        </div>

        <figure className="studio-closing-folio">
          <div className="studio-closing-art">
            <img
              src="/illustrations/studio-new-triptych.webp"
              alt="A storybook triptych of a candlelit library, an enchanted white stag, and an astronomer releasing paper birds"
              width="1536"
              height="1024"
              loading="lazy"
              decoding="async"
            />
            <span aria-hidden="true">ENDPLATE</span>
          </div>
          <figcaption>
            <span>STUDIO ENDPLATE · REFERENCE IMAGERY</span>
            <strong>{project.volume} · VISUAL ARCHIVE</strong>
          </figcaption>
        </figure>
      </main>

      <StudioDialogs
        project={project}
        manuscriptOpen={manuscriptOpen}
        lightbox={lightbox}
        dialogRef={overlayDialogRef}
        closeRef={overlayCloseRef}
        close={closeOverlay}
      />
    </AppChrome>
  );
}
