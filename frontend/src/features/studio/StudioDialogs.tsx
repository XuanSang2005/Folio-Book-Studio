import type { RefObject } from "react";
import { projectPlateSrc, wordCount } from "../../lib/demo-store/data";
import type { Project } from "../../lib/demo-store/types";

type StudioDialogsProps = {
  project: Project;
  manuscriptOpen: boolean;
  lightbox: string | null;
  dialogRef: RefObject<HTMLElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  close: () => void;
};

export function StudioDialogs({
  project,
  manuscriptOpen,
  lightbox,
  dialogRef,
  closeRef,
  close,
}: StudioDialogsProps) {
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
            <div className="manuscript-copy">
              <span className="drop-cap">{project.bookText.trim()[0]}</span>
              {project.bookText.trim().slice(1)}
            </div>
            <footer>
              <span>{wordCount(project.bookText).toLocaleString()} WORDS</span>
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
          <section ref={dialogRef} className="lightbox" role="dialog" aria-modal="true" aria-label={lightbox}>
            <button
              ref={closeRef}
              className="modal-close lightbox-close"
              onClick={close}
              aria-label="Close image"
            >
              ×
            </button>
            <div className={lightbox.includes("Final")
              ? "lightbox-image-frame final"
              : "lightbox-image-frame portrait"}
            >
              <img
                src={lightbox.includes("Final")
                  ? projectPlateSrc(project)
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
    </>
  );
}
