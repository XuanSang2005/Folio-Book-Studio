import type { MouseEvent } from "react";
import { STEPS } from "../../lib/demo-store/data";
import type { Character, Project } from "../../lib/demo-store/types";

type PortraitCardProps = {
  character: Character;
  index: number;
  project: Project;
  openLightbox: (label: string, event: MouseEvent<HTMLElement>) => void;
};

export function PortraitCard({ character, index, project, openLightbox }: PortraitCardProps) {
  const ready = project.completedSteps > 2 || project.portraitProgress > index;
  const generating =
    project.completedSteps === 2
    && project.stepState === "running"
    && !ready
    && index === project.portraitProgress;

  return (
    <article className="portrait-card">
      <button
        className={`portrait-art portrait-${index + 1} ${ready ? "ready" : "pending"}`}
        onClick={(event) => ready && openLightbox(`${character.name} · Portrait plate ${index + 1}`, event)}
        disabled={!ready}
        aria-label={ready
          ? `Open portrait of ${character.name}`
          : `${character.name} portrait not generated yet`}
      >
        {ready ? (
          <img
            className="portrait-image"
            src={index === 0
              ? "/illustrations/mole-portrait.webp"
              : "/illustrations/ratty-portrait.webp"}
            alt={`Illustrated portrait of ${character.name}`}
            width="220"
            height="330"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        {generating ? (
          <span className="press-loader"><i />Rendering plate {STEPS[index].roman}</span>
        ) : null}
        {!ready && !generating ? (
          <span className="portrait-awaiting" aria-hidden="true">
            <i>{index === 0 ? "I" : "II"}</i>
            <strong>Portrait plate</strong>
            <small>Awaits Stage III</small>
          </span>
        ) : null}
      </button>
      <div className="plate-meta">
        <span>PLATE {index === 0 ? "I" : "II"}</span>
        <span>{ready ? "GENERATED" : generating ? "IN PRESS" : "PENDING"}</span>
      </div>
      <h3>{character.name}</h3>
      <p className="role-line">{character.role}</p>
      <details><summary>Portrait brief</summary><p>{character.prompt}</p></details>
    </article>
  );
}
