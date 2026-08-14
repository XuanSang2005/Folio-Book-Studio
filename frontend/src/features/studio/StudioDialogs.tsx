import type { ProjectDetailDto } from "@gradion-folio/contracts";
import type { RefObject } from "react";
import { wordCount } from "../../lib/presentation";
import type { LightboxImage } from "./PortraitCard";

type StudioDialogsProps = {
  project: ProjectDetailDto;
  manuscript?: string;
  manuscriptPending: boolean;
  manuscriptError: boolean;
  retryManuscript: () => void;
  manuscriptOpen: boolean;
  lightbox: LightboxImage | null;
  dialogRef: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  close: () => void;
};

export function StudioDialogs({
  project,
  manuscript,
  manuscriptPending,
  manuscriptError,
  retryManuscript,
  manuscriptOpen,
  lightbox,
  dialogRef,
  closeRef,
  close,
}: StudioDialogsProps) {
  const trimmedManuscript = manuscript?.trim() ?? "";

  return (
    <>
      {manuscriptOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && close()}
        >
          <section
            ref={dialogRef}
            className="manuscript-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manuscript-title"
          >
            <header>
              <div>
                <p className="kicker">SOURCE MANUSCRIPT · READ-ONLY</p>
                <h2 id="manuscript-title">{project.title}</h2>
              </div>
              <button
                ref={closeRef}
                className="modal-close"
                onClick={close}
                aria-label="Close manuscript"
              >
                ×
              </button>
            </header>
            <div className="manuscript-copy" aria-live="polite">
              {manuscriptPending ? (
                <p>Loading the complete manuscript…</p>
              ) : manuscriptError ? (
                <div role="alert">
                  <p>The complete manuscript could not be loaded. The persisted source has not been changed.</p>
                  <button className="text-link" onClick={retryManuscript}>Retry manuscript →</button>
                </div>
              ) : trimmedManuscript ? (
                <><span className="drop-cap">{trimmedManuscript[0]}</span>{trimmedManuscript.slice(1)}</>
              ) : (
                <p>The manuscript is empty.</p>
              )}
            </div>
            <footer>
              <span>{(manuscript ? wordCount(manuscript) : project.source.wordCount).toLocaleString()} WORDS</span>
              <span>FULL TEXT REMAINS AVAILABLE AT EVERY STAGE</span>
            </footer>
          </section>
        </div>
      ) : null}

      {lightbox ? (
        <div
          className="modal-backdrop lightbox-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && close()}
        >
          <section ref={dialogRef} className="lightbox" role="dialog" aria-modal="true" aria-label={lightbox.label}>
            <button
              ref={closeRef}
              className="modal-close lightbox-close"
              onClick={close}
              aria-label="Close image"
            >
              ×
            </button>
            <div className={`lightbox-image-frame ${lightbox.kind}`}>
              <img
                src={lightbox.url}
                alt={lightbox.label}
                width="490"
                height="976"
                decoding="async"
              />
            </div>
            <p>{lightbox.label}</p>
          </section>
        </div>
      ) : null}
    </>
  );
}
