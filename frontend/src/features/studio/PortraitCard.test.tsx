import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { characterOne } from "../../test/fixtures";
import { PortraitCard } from "./PortraitCard";

describe("PortraitCard", () => {
  it("renders a completed portrait as an interactive plate", () => {
    render(
      <PortraitCard
        character={characterOne}
        index={0}
        openLightbox={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Open portrait of Mole" })).toBeEnabled();
    expect(screen.getByAltText("Illustrated portrait of Mole")).toBeInTheDocument();
    expect(screen.getByText("GENERATED")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", characterOne.portraitUrl);
  });

  it("keeps a running portrait in press without a fixture image", () => {
    render(
      <PortraitCard
        character={{ ...characterOne, portraitState: "running", portraitUrl: null }}
        index={0}
        openLightbox={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Mole portrait not generated yet" })).toBeDisabled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/Rendering plate I/)).toBeInTheDocument();
  });
});
