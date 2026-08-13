import type {
  ChangeEvent,
  DragEvent,
  RefObject,
} from "react";
import { wordCount } from "../../lib/demo-store/data";
import type { SourceMode } from "../../lib/demo-store/types";

type SourceDialogProps = {
  open: boolean;
  mode: SourceMode;
  sourceDraft: string;
  sourceDragActive: boolean;
  sourceModalError: string;
  fileName: string;
  manuscriptText: string;
  dialogRef: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  dropButtonRef: RefObject<HTMLButtonElement | null>;
  setMode: (mode: SourceMode) => void;
  setSourceDraft: (value: string) => void;
  setSourceDragActive: (value: boolean) => void;
  setSourceModalError: (value: string) => void;
  clearFileError: () => void;
  clearManuscriptError: () => void;
  close: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (event: DragEvent<HTMLElement>) => void;
  usePastedSource: () => void;
};

export function SourceDialog({
  open,
  mode,
  sourceDraft,
  sourceDragActive,
  sourceModalError,
  fileName,
  manuscriptText,
  dialogRef,
  closeRef,
  fileInputRef,
  textInputRef,
  dropButtonRef,
  setMode,
  setSourceDraft,
  setSourceDragActive,
  setSourceModalError,
  clearFileError,
  clearManuscriptError,
  close,
  onFileChange,
  onFileDrop,
  usePastedSource,
}: SourceDialogProps) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop source-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        ref={dialogRef}
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
            <p id="source-dialog-description">
              Choose one complete plain-text source. It will be carried through all five illustration stages.
            </p>
          </div>
          <button
            ref={closeRef}
            className="modal-close"
            type="button"
            onClick={close}
            aria-label="Close add manuscript dialog"
          >
            ×
          </button>
        </header>

        <div className="source-modal-stage">
          {mode === "upload" ? (
            <>
              <input
                ref={fileInputRef}
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
                ref={dropButtonRef}
                className={sourceDragActive ? "source-drop-zone dragging" : "source-drop-zone"}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setSourceDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setSourceDragActive(true);
                }}
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
              {sourceModalError ? (
                <p className="inline-error source-modal-error" id="source-modal-file-error" role="alert">
                  {sourceModalError}
                </p>
              ) : null}
              {fileName ? (
                <p className="source-current-status">
                  Current source: {fileName} · {wordCount(manuscriptText).toLocaleString()} words
                </p>
              ) : null}
            </>
          ) : (
            <div className="source-text-panel">
              <div className="source-text-heading">
                <label htmlFor="source-manuscript-text">Paste the complete manuscript</label>
                <span>{wordCount(sourceDraft).toLocaleString()} words</span>
              </div>
              <textarea
                ref={textInputRef}
                id="source-manuscript-text"
                rows={12}
                value={sourceDraft}
                aria-invalid={Boolean(sourceModalError)}
                aria-describedby={sourceModalError ? "source-modal-text-error" : "source-text-help"}
                onChange={(event) => {
                  setSourceDraft(event.target.value);
                  if (sourceModalError) setSourceModalError("");
                  clearFileError();
                }}
                placeholder="Paste the manuscript…"
              />
              <div className="source-text-meta">
                <span id="source-text-help">PLAIN TEXT · UTF-8</span>
                <span>ONE COMPLETE SOURCE</span>
              </div>
              {sourceModalError ? (
                <p className="inline-error source-modal-error" id="source-modal-text-error" role="alert">
                  {sourceModalError}
                </p>
              ) : null}
              <button className="primary-button source-use-text" type="button" onClick={usePastedSource}>
                Use pasted text <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>

        <footer className="source-modal-methods" aria-label="Manuscript source method">
          <button
            className={mode === "upload" ? "source-method selected" : "source-method"}
            type="button"
            aria-pressed={mode === "upload"}
            onClick={() => {
              setMode("upload");
              clearManuscriptError();
              setSourceModalError("");
              window.setTimeout(() => fileInputRef.current?.click(), 0);
            }}
          >
            <span aria-hidden="true">↑</span><strong>Upload .txt</strong><small>From this device</small>
          </button>
          <button
            className={mode === "paste" ? "source-method selected" : "source-method"}
            type="button"
            aria-pressed={mode === "paste"}
            onClick={() => {
              setMode("paste");
              clearFileError();
              setSourceModalError("");
              window.setTimeout(() => textInputRef.current?.focus(), 0);
            }}
          >
            <span aria-hidden="true">¶</span><strong>Text input</strong><small>Paste the manuscript</small>
          </button>
          <button className="source-modal-cancel" type="button" onClick={close}>Cancel</button>
        </footer>
      </section>
    </div>
  );
}
