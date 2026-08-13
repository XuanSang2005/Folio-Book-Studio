import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { AppChrome } from "../../components/layout/AppChrome";
import { useDemoStore } from "../../lib/demo-store/DemoStore";
import { STEPS, wordCount } from "../../lib/demo-store/data";
import type { SourceMode } from "../../lib/demo-store/types";
import { SourceDialog } from "./SourceDialog";

export function NewVolumePage() {
  const navigate = useNavigate();
  const { draft, setDraft, createProject } = useDemoStore();
  const [newTitleError, setNewTitleError] = useState("");
  const [newManuscriptError, setNewManuscriptError] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceDragActive, setSourceDragActive] = useState(false);
  const [sourceModalError, setSourceModalError] = useState("");
  const modalReturnFocus = useRef<HTMLElement | null>(null);
  const overlayCloseRef = useRef<HTMLButtonElement | null>(null);
  const overlayDialogRef = useRef<HTMLElement | null>(null);
  const newTitleInputRef = useRef<HTMLInputElement | null>(null);
  const newTextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sourceDropButtonRef = useRef<HTMLButtonElement | null>(null);
  const sourceReplaceRef = useRef<HTMLButtonElement | null>(null);
  const focusSourceReceiptAfterCloseRef = useRef(false);

  const closeSource = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (!sourceModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSource();
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
  }, [closeSource, sourceModalOpen]);

  useEffect(() => {
    if (!sourceModalOpen) return;
    const focusTimer = window.setTimeout(() => {
      if (sourceMode === "paste") newTextInputRef.current?.focus();
      else sourceDropButtonRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [sourceModalOpen, sourceMode]);

  useEffect(() => {
    if (!sourceModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sourceModalOpen]);

  function openSourceModal(event: MouseEvent<HTMLElement> | null, mode: SourceMode) {
    modalReturnFocus.current = event?.currentTarget ?? sourceTriggerRef.current;
    setSourceMode(mode);
    setSourceDraft(mode === "paste" && !draft.fileName ? draft.text : "");
    setSourceDragActive(false);
    setSourceModalError("");
    setSourceModalOpen(true);
  }

  async function readManuscriptFile(file?: File) {
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
    setDraft({ fileName: file.name, text });
    setSourceModalError("");
    setNewFileError("");
    setNewManuscriptError("");
    return true;
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    void readManuscriptFile(input.files?.[0]).then((accepted) => {
      input.value = "";
      if (accepted) {
        focusSourceReceiptAfterCloseRef.current = true;
        closeSource();
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
    void readManuscriptFile(event.dataTransfer.files[0]).then((accepted) => {
      if (accepted) {
        focusSourceReceiptAfterCloseRef.current = true;
        closeSource();
      }
    });
  }

  function usePastedSource() {
    const text = sourceDraft.trim();
    if (!text) {
      setSourceModalError("Paste the manuscript text before adding this source.");
      newTextInputRef.current?.focus();
      return;
    }
    setDraft({ text, fileName: "" });
    setSourceModalError("");
    setNewFileError("");
    setNewManuscriptError("");
    focusSourceReceiptAfterCloseRef.current = true;
    closeSource();
  }

  function removeSource() {
    setDraft({ text: "", fileName: "" });
    setSourceDraft("");
    setNewFileError("");
    setNewManuscriptError("");
    if (newFileInputRef.current) newFileInputRef.current.value = "";
    window.setTimeout(() => sourceTriggerRef.current?.focus(), 0);
  }

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const titleMissing = !draft.title.trim();
    const manuscriptMissing = !draft.text.trim();
    setNewTitleError(titleMissing ? "Give this volume a title." : "");
    setNewManuscriptError(manuscriptMissing ? "Upload or paste a manuscript." : "");
    if (titleMissing) {
      newTitleInputRef.current?.focus();
      return;
    }
    if (newFileError || manuscriptMissing) {
      openSourceModal(null, "upload");
      return;
    }
    const id = createProject();
    setNewTitleError("");
    setNewManuscriptError("");
    setNewFileError("");
    void navigate({ to: "/volumes/$volumeId", params: { volumeId: id } });
  }

  const sourceWords = wordCount(draft.text);
  const titleInvalid = Boolean(newTitleError);
  const fileInvalid = Boolean(newFileError);
  const manuscriptInvalid = Boolean(newManuscriptError);
  const manuscriptReady = Boolean(draft.text.trim() && !newFileError);
  const sourceReady = Boolean(draft.title.trim() && draft.text.trim() && !newFileError);

  return (
    <AppChrome view="new">
      <main className="page-shell new-project-page mx-auto">
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
            <figcaption>
              <span>REFERENCE PROOF</span><strong>PLATES I–V · VISUAL RANGE</strong>
            </figcaption>
          </figure>
        </section>

        <form className="commission-form" onSubmit={submitProject} noValidate>
          <section className="commission-desk" aria-labelledby="commission-desk-heading">
            <header className="commission-desk-header">
              <div>
                <p className="kicker">COMMISSION DESK · SOURCE 01</p>
                <h2 id="commission-desk-heading">Name the edition. <em>Attach its one source.</em></h2>
              </div>
              <p>
                Two details begin the studio: a working title and the complete manuscript. Both remain editable until the volume is created.
              </p>
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
                        value={draft.title}
                        onChange={(event) => {
                          setDraft({ title: event.target.value });
                          if (newTitleError) setNewTitleError("");
                        }}
                        placeholder="The Secret Garden — Illustrated Edition"
                      />
                      {!draft.title ? (
                        <span className="title-mascot-controls" aria-hidden="true">
                          <picture className="title-field-mascot">
                            <source
                              srcSet="/illustrations/folio-mascot-loop.webp"
                              type="image/webp"
                              media="(prefers-reduced-motion: no-preference)"
                            />
                            <img
                              src="/illustrations/folio-mascot.png"
                              alt=""
                              width="109"
                              height="144"
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                            />
                          </picture>
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <p className="panel-note" id="volume-title-note">
                    Use the title that should appear in your working library.
                  </p>
                  {titleInvalid ? (
                    <p className="inline-error" id="new-title-error" role="alert">{newTitleError}</p>
                  ) : null}
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
                        <strong>{draft.fileName || "Pasted manuscript"}</strong>
                        <span
                          role="status"
                          aria-live="polite"
                          aria-label={`${draft.fileName || "Pasted manuscript"}, ${sourceWords.toLocaleString()} words, source ready`}
                        >
                          {sourceWords.toLocaleString()} words · uploaded once
                        </span>
                      </span>
                      <span className="source-receipt-actions">
                        <button
                          ref={sourceReplaceRef}
                          type="button"
                          aria-haspopup="dialog"
                          aria-controls="source-dialog"
                          onClick={(event) => openSourceModal(event, draft.fileName ? "upload" : "paste")}
                        >
                          Replace
                        </button>
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
                      <button
                        className="source-paste-trigger"
                        type="button"
                        aria-haspopup="dialog"
                        aria-controls="source-dialog"
                        onClick={(event) => openSourceModal(event, "paste")}
                      >
                        Paste text instead
                      </button>
                    </div>
                  )}
                  {fileInvalid && !sourceModalOpen ? (
                    <p className="inline-error" id="new-file-error" role="alert">{newFileError}</p>
                  ) : null}
                  {manuscriptInvalid ? (
                    <p className="inline-error" id="new-manuscript-error" role="alert">
                      {newManuscriptError}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>

            <section className="pipeline-ledger" aria-labelledby="pipeline-ledger-heading">
              <header>
                <div>
                  <p className="kicker">THE EDITION PIPELINE</p>
                  <h3 id="pipeline-ledger-heading">One source becomes five deliberate stages.</h3>
                </div>
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
                <p>
                  {sourceReady
                    ? `${sourceWords.toLocaleString()} words prepared · ready to enter Stage I`
                    : "Add the title and manuscript to open this commission."}
                </p>
              </div>
              <button
                className={sourceReady
                  ? "primary-button commission-submit ready"
                  : "primary-button commission-submit"}
                type="submit"
              >
                Create this volume <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </form>
      </main>

      <SourceDialog
        open={sourceModalOpen}
        mode={sourceMode}
        sourceDraft={sourceDraft}
        sourceDragActive={sourceDragActive}
        sourceModalError={sourceModalError}
        fileName={draft.fileName}
        manuscriptText={draft.text}
        dialogRef={overlayDialogRef}
        closeRef={overlayCloseRef}
        fileInputRef={newFileInputRef}
        textInputRef={newTextInputRef}
        dropButtonRef={sourceDropButtonRef}
        setMode={setSourceMode}
        setSourceDraft={setSourceDraft}
        setSourceDragActive={setSourceDragActive}
        setSourceModalError={setSourceModalError}
        clearFileError={() => setNewFileError("")}
        clearManuscriptError={() => setNewManuscriptError("")}
        close={closeSource}
        onFileChange={onFileChange}
        onFileDrop={onFileDrop}
        usePastedSource={usePastedSource}
      />
    </AppChrome>
  );
}
