import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AuraOneMark,
  ProoflineProductGlyph,
  ProoflineState,
  ProoflineStatus,
  prooflineStatusTones,
} from "../src";

describe("Proofline status", () => {
  it("provides a visible label for every status tone", () => {
    for (const tone of prooflineStatusTones) {
      const { unmount } = render(<ProoflineStatus tone={tone} />);
      expect(screen.getByText(/\S+/)).toBeVisible();
      unmount();
    }
  });

  it("uses an alert role for failure states", () => {
    render(<ProoflineState title="Evaluation failed" tone="danger" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Evaluation failed");
  });

  it("exports accessible brand and product identity", () => {
    render(
      <>
        <AuraOneMark title="AuraOne" />
        <ProoflineProductGlyph product="rubric-studio" title="Rubric Studio" />
      </>,
    );
    expect(screen.getByRole("img", { name: "AuraOne" })).toBeVisible();
    expect(screen.getByLabelText("Rubric Studio")).toBeVisible();
  });
});
