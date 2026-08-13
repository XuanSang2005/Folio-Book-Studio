import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_CHARACTERS, SEED_PROJECTS } from "../../lib/demo-store/data";
import { PortraitCard } from "./PortraitCard";

describe("PortraitCard", () => {
  it("renders a completed portrait as an interactive plate", () => {
    render(
      <PortraitCard
        character={SAMPLE_CHARACTERS[0]}
        index={0}
        project={SEED_PROJECTS[0]}
        openLightbox={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Open portrait of Mole" })).toBeEnabled();
    expect(screen.getByAltText("Illustrated portrait of Mole")).toBeInTheDocument();
    expect(screen.getByText("GENERATED")).toBeInTheDocument();
  });
});
