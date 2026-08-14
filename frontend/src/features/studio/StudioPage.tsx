import {
  MAX_ADULT_CHARACTERS,
  MAX_CHAPTERS,
  PIPELINE_STEPS,
  type PipelineStepOrdinal,
} from "@gradion-folio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { AppChrome } from "../../components/layout/AppChrome";
import {
  ApiError,
  recoverProjectStep,
  runProjectStep,
} from "../../lib/api/client";
import {
  manuscriptQueryOptions,
  projectQueryOptions,
} from "../../lib/api/queries";
import { queryKeys } from "../../lib/api/query-keys";
import { STEPS } from "../../lib/presentation";
import { PortraitCard, type LightboxImage } from "./PortraitCard";
import { StudioDialogs } from "./StudioDialogs";

export function StudioPage({ volumeId }: { volumeId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [artDirection, setArtDirection] = useState("");
  const [manuscriptOpen, setManuscriptOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
  const modalReturnFocus = useRef<HTMLElement | null>(null);
  const overlayCloseRef = useRef<HTMLButtonElement | null>(null);
  const overlayDialogRef = useRef<HTMLElement | null>(null);

  const runStep = useMutation({
    mutationFn: ({ ordinal, direction }: { ordinal: PipelineStepOrdinal; direction?: string }) => (
      runProjectStep(
        volumeId,
        ordinal,
        ordinal === 1 && direction?.trim() ? { artDirection: direction.trim() } : {},
      )
    ),
    retry: false,
    onSuccess: async ({ project }) => {
      queryClient.setQueryData(queryKeys.projectDetail(volumeId), project);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectList,
        exact: true,
        refetchType: "none",
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectDetail(volumeId),
        exact: true,
        refetchType: "active",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectList,
        exact: true,
        refetchType: "none",
      });
    },
  });

  const recoverStep = useMutation({
    mutationFn: (ordinal: PipelineStepOrdinal) => recoverProjectStep(volumeId, ordinal),
    retry: false,
    onSuccess: async ({ project }) => {
      queryClient.setQueryData(queryKeys.projectDetail(volumeId), project);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectList,
        exact: true,
        refetchType: "none",
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectDetail(volumeId),
        exact: true,
        refetchType: "active",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectList,
        exact: true,
        refetchType: "none",
      });
    },
  });

  const projectQuery = useQuery({
    ...projectQueryOptions(volumeId),
    refetchInterval: (query) => {
      const persistedCurrentStep = query.state.data?.steps.find(
        (step) => step.visibleState !== "succeeded",
      );
      const pendingRunTargetsCurrentStep = runStep.isPending
        && runStep.variables?.ordinal === persistedCurrentStep?.ordinal;
      return persistedCurrentStep?.visibleState === "running" || pendingRunTargetsCurrentStep
        ? 1_500
        : false;
    },
  });
  const manuscriptQuery = useQuery(manuscriptQueryOptions(volumeId));

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

  if (projectQuery.isPending) {
    return (
      <AppChrome view="studio">
        <main className="page-shell studio-page mx-auto" aria-live="polite">
          <section className="empty-library"><div><p className="kicker">OPENING THE STUDIO</p><h2>Restoring the volume…</h2></div></section>
        </main>
      </AppChrome>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    const missing = projectQuery.error instanceof ApiError && projectQuery.error.status === 404;
    return (
      <AppChrome view="studio">
        <main className="page-shell studio-page mx-auto">
          <section className="empty-library" role="alert"><div>
            <p className="kicker">{missing ? "VOLUME NOT FOUND" : "THE STUDIO COULD NOT OPEN"}</p>
            <h2>{missing ? "This volume is not in your library." : "The persisted project is temporarily unavailable."}</h2>
            <button className="primary-button" onClick={() => missing
              ? void navigate({ to: "/library" })
              : void projectQuery.refetch()}>
              {missing ? "Return to library" : "Retry project"} <span aria-hidden="true">→</span>
            </button>
          </div></section>
        </main>
      </AppChrome>
    );
  }

  const project = projectQuery.data;
  const currentSummary = project.steps.find((step) => step.visibleState !== "succeeded") ?? null;
  const currentIndex = currentSummary ? currentSummary.ordinal - 1 : STEPS.length - 1;
  const currentStep = currentSummary ? STEPS[currentSummary.ordinal - 1] : null;
  const complete = currentSummary === null;
  const visibleState = currentSummary?.visibleState ?? "succeeded";
  const runMutationTargetsCurrentStep = !complete
    && runStep.variables?.ordinal === currentSummary?.ordinal;
  const recoverMutationTargetsCurrentStep = !complete
    && recoverStep.variables === currentSummary?.ordinal;
  const mutationError = runMutationTargetsCurrentStep && runStep.isError
    ? runStep.error instanceof ApiError
      ? runStep.error.message
      : "The stage request could not be completed."
    : null;
  const recoverMutationError = recoverMutationTargetsCurrentStep && recoverStep.isError
    ? recoverStep.error instanceof ApiError
      ? recoverStep.error.message
      : "The recovery request could not be completed."
    : null;
  const stuck = !complete && visibleState === "stuck";
  const running = !complete && (
    visibleState === "running"
    || (
      runStep.isPending
      && runMutationTargetsCurrentStep
      && (visibleState === "pending" || visibleState === "failed")
    )
  );
  const failed = !complete && visibleState === "failed" && !running;
  const actionState = complete ? "idle" : stuck ? "stuck" : running ? "running" : failed ? "failed" : "idle";
  const showCharacters = project.characters.length > 0;
  const chapter = project.chapters[0];
  const showChapter = Boolean(chapter);
  const illustrationReady = Boolean(
    chapter?.illustrationState === "succeeded" && chapter.illustrationUrl,
  );
  const portraitProgress = project.characters.filter((character) => (
    character.portraitState === "succeeded" && character.portraitUrl
  )).length;
  const studioStateLabel = complete
    ? "All five illustration stages complete"
    : stuck
        ? `Stage ${currentStep?.roman} interrupted`
        : running
          ? `Stage ${currentStep?.roman} in progress`
          : failed
            ? `Stage ${currentStep?.roman} failed`
          : `Stage ${currentStep?.roman} ready`;

  function openManuscript(event: MouseEvent<HTMLElement>) {
    modalReturnFocus.current = event.currentTarget;
    setManuscriptOpen(true);
  }

  function openLightbox(image: LightboxImage, event: MouseEvent<HTMLElement>) {
    modalReturnFocus.current = event.currentTarget;
    setLightbox(image);
  }

  function runCurrentStep() {
    if (!currentSummary) return;
    runStep.reset();
    runStep.mutate({ ordinal: currentSummary.ordinal, direction: artDirection });
  }

  function recoverCurrentStep() {
    if (!currentSummary) return;
    recoverStep.reset();
    recoverStep.mutate(currentSummary.ordinal);
  }

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
              const summary = project.steps[index];
              const done = summary.visibleState === "succeeded";
              const current = summary.ordinal === currentSummary?.ordinal;
              const state = done ? "complete" : current ? actionState : "pending";
              const stateLabel = done
                ? "Complete"
                : current
                  ? actionState === "idle" ? "Ready" : actionState
                  : "Pending";
              return (
                <li
                  key={step.roman}
                  className={`${done ? "done" : current ? "current" : "pending"} ${state}`}
                  aria-current={current ? "step" : undefined}
                  aria-label={`Step ${index + 1} of ${PIPELINE_STEPS.length}, ${step.label}, ${stateLabel}`}
                >
                  <span className="step-roman">{done ? "✓" : step.roman}</span>
                  <span><small>{step.eyebrow}</small><strong>{step.label}</strong></span>
                  <em>{stateLabel.toUpperCase()}</em>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="studio-grid">
          <section className="studio-workbench">
            <div className={`action-panel action-${actionState}`} aria-busy={running}>
              <div className="action-index">{complete ? "✓" : `0${currentIndex + 1}`}</div>
              <div className="action-content">
                {complete ? (
                  <>
                    <p className="kicker">VOLUME COMPLETE · ALL FIVE STAGES</p>
                    <h2>The final plate is in the folio.</h2>
                    <p>Every result is preserved. Reopening this project will never regenerate work automatically.</p>
                  </>
                ) : stuck ? (
                  <>
                    <p className="kicker warning-copy">INTERRUPTED REQUEST</p>
                    <h2>This stage has stopped responding.</h2>
                    <p>
                      {currentSummary?.errorMessage} Recovering only clears the abandoned lease; it does not touch completed artifacts.
                    </p>
                    <button className="primary-button" onClick={recoverCurrentStep} disabled={recoverStep.isPending}>
                      {recoverStep.isPending ? "Recovering…" : "Recover this stage"} <span aria-hidden="true">→</span>
                    </button>
                    {recoverMutationError ? (
                      <p className="inline-error" role="alert">{recoverMutationError}</p>
                    ) : null}
                  </>
                ) : running ? (
                  <>
                    <p className="kicker">STAGE {currentStep?.roman} · IN PRESS</p>
                    <h2>{currentStep?.running}</h2>
                    <div className="press-progress">
                      <i /><span>Gemini request in flight · duplicate execution locked</span>
                    </div>
                    {currentSummary?.ordinal === 3 ? (
                      <p className="item-progress">
                        Portrait plates complete: {portraitProgress} / {project.characters.length}
                      </p>
                    ) : null}
                  </>
                ) : failed ? (
                  <>
                    <p className="kicker danger-copy">STAGE NEEDS ATTENTION</p>
                    <h2>{currentStep?.label} could not be completed.</h2>
                    <p>{currentSummary?.errorMessage ?? mutationError ?? "The provider request failed."}</p>
                    <button className="primary-button" onClick={runCurrentStep} disabled={runStep.isPending}>
                      Retry {currentStep?.label} <span aria-hidden="true">↻</span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className="kicker">
                      READY FOR STAGE {currentStep?.roman} · {currentStep?.eyebrow.toUpperCase()}
                    </p>
                    <h2>
                      {currentSummary?.ordinal === 1
                        ? "Establish the visual grammar."
                        : `Generate ${currentStep?.label.toLowerCase()}.`}
                    </h2>
                    <p>
                      {currentSummary?.ordinal === 1
                        ? "Set an optional art direction, or leave it blank and let Gemini propose one from the manuscript."
                        : "This action runs only the current stage. Completed work remains untouched."}
                    </p>
                    {currentSummary?.ordinal === 1 ? (
                      <label className="field action-field">
                        <span>Art direction (optional)</span>
                        <input
                          value={artDirection}
                          onChange={(event) => setArtDirection(event.target.value)}
                          placeholder="e.g. Arts & Crafts watercolour, soft ink contours…"
                        />
                      </label>
                    ) : null}
                    <button className="primary-button" onClick={runCurrentStep} disabled={runStep.isPending}>
                      Generate {currentStep?.label} <span aria-hidden="true">→</span>
                    </button>
                    {mutationError ? (
                      <p className="inline-error" role="alert">{mutationError}</p>
                    ) : null}
                  </>
                )}
              </div>
              <p
                className="studio-live-status"
                role={failed ? "alert" : "status"}
                aria-live={failed ? "assertive" : "polite"}
                aria-atomic="true"
              >
                {studioStateLabel}
              </p>
            </div>

            {showChapter && chapter ? (
              <section className="artifact-section chapter-section">
                <div className="section-heading-row">
                  <div>
                    <p className="kicker">
                      SCENE BLUEPRINT · {project.chapters.length} OF {MAX_CHAPTERS} SLOT USED
                    </p>
                    <h2>{chapter.name}</h2>
                  </div>
                  <span>CHAPTER PLATE</span>
                </div>
                <div className="chapter-folio-card">
                  <button
                    className={`chapter-art ${illustrationReady ? "ready" : "waiting"}`}
                    aria-label={illustrationReady
                      ? `Open final illustration for ${chapter.name}`
                      : "Final illustration awaits Stage V"}
                    onClick={(event) => illustrationReady && chapter.illustrationUrl
                      && openLightbox({
                        url: chapter.illustrationUrl,
                        label: `${chapter.name} · Final illustration`,
                        kind: "final",
                      }, event)}
                    disabled={!illustrationReady}
                  >
                    {illustrationReady && chapter.illustrationUrl ? (
                      <img
                        className="chapter-image"
                        src={chapter.illustrationUrl}
                        alt=""
                        width="490"
                        height="976"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                    {!illustrationReady ? (
                      <span className="chapter-awaiting" aria-hidden="true">
                        <i>V</i><strong>Final illustration</strong><small>Awaits Stage V</small>
                      </span>
                    ) : (
                      <span className="chapter-ready-label">
                        FINAL PLATE · {chapter.name.toUpperCase()}
                      </span>
                    )}
                  </button>
                  <div className="chapter-brief">
                    <div className="chapter-brief-meta">
                      <span>SCENE 01</span><span>{illustrationReady ? "GENERATED" : "BLUEPRINT READY"}</span>
                    </div>
                    <p className="kicker">ILLUSTRATION BRIEF</p>
                    <h3>Compose the final plate.</h3>
                    <p className="chapter-prompt">{chapter.prompt}</p>
                    <div className="chapter-brief-foot">
                      <span>CAST {String(chapter.characterNames.length).padStart(2, "0")}</span>
                      <span>SCENE 01</span>
                      <span>{illustrationReady ? "PLATE READY" : "PLATE PENDING"}</span>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {showCharacters ? (
              <section className="artifact-section">
                <div className="section-heading-row">
                  <div>
                    <p className="kicker">
                      THE CAST · {project.characters.length} OF {MAX_ADULT_CHARACTERS} SLOTS USED
                    </p>
                    <h2>Principal characters</h2>
                  </div>
                  <span>ADULT CAST ONLY</span>
                </div>
                <div className="portrait-grid">
                  {project.characters.map((character, index) => (
                    <PortraitCard
                      key={character.id}
                      character={character}
                      index={index}
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
              <p>{project.style ?? "Stage I will create a reusable style instruction for every prompt and image that follows."}</p>
            </section>
            <section className="note-card source-note">
              <div className="note-card-head">
                <p className="kicker">SOURCE MANUSCRIPT</p>
                <span>{project.source.wordCount.toLocaleString()} WORDS</span>
              </div>
              {manuscriptQuery.isPending ? (
                <blockquote>Loading the source excerpt…</blockquote>
              ) : manuscriptQuery.isError ? (
                <blockquote>The source excerpt could not be loaded.</blockquote>
              ) : (
                <blockquote>“{manuscriptQuery.data.text.replace(/\s+/g, " ").slice(0, 238)}…”</blockquote>
              )}
              <button className="text-link" onClick={openManuscript}>Read the complete text →</button>
            </section>
            <section className="note-card context-note">
              <span className="context-mark" aria-hidden="true">◆</span>
              <p className="kicker">CONTEXT & COST</p>
              <h3>Uploaded once. Reused throughout.</h3>
              <p>
                The production app chains context between stages, enforces {MAX_ADULT_CHARACTERS} character / {MAX_CHAPTERS} chapter caps server-side, and never auto-retries.
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
            <strong>VOL. {String(project.volumeNumber).padStart(2, "0")} · VISUAL ARCHIVE</strong>
          </figcaption>
        </figure>
      </main>

      <StudioDialogs
        project={project}
        manuscript={manuscriptQuery.data?.text}
        manuscriptPending={manuscriptQuery.isPending}
        manuscriptError={manuscriptQuery.isError}
        retryManuscript={() => void manuscriptQuery.refetch()}
        manuscriptOpen={manuscriptOpen}
        lightbox={lightbox}
        dialogRef={overlayDialogRef}
        closeRef={overlayCloseRef}
        close={closeOverlay}
      />
    </AppChrome>
  );
}
