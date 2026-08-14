import type { CharacterDto } from "@gradion-folio/contracts";
import type { MouseEvent } from "react";

export type LightboxImage = {
  url: string;
  label: string;
  kind: "portrait" | "final";
};

type PortraitCardProps = {
  character: CharacterDto;
  index: number;
  openLightbox: (image: LightboxImage, event: MouseEvent<HTMLElement>) => void;
};

export function PortraitCard({ character, index, openLightbox }: PortraitCardProps) {
  const ready = character.portraitState === "succeeded" && Boolean(character.portraitUrl);
  const generating = character.portraitState === "running";

  return (
    <article className="portrait-card">
      <button
        className={`portrait-art portrait-${index + 1} ${ready ? "ready" : "pending"}`}
        onClick={(event) => ready && character.portraitUrl && openLightbox({
          url: character.portraitUrl,
          label: `${character.name} · Portrait plate ${index + 1}`,
          kind: "portrait",
        }, event)}
        disabled={!ready}
        aria-label={ready
          ? `Open portrait of ${character.name}`
          : `${character.name} portrait not generated yet`}
      >
        {ready ? (
          <img
            className="portrait-image"
            src={character.portraitUrl ?? undefined}
            alt={`Illustrated portrait of ${character.name}`}
            width="220"
            height="330"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        {generating ? (
          <span className="press-loader"><i />Rendering plate {index === 0 ? "I" : "II"}</span>
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
