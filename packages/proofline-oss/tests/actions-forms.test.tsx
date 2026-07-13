import { fireEvent, render, screen } from "@testing-library/react";
import { Settings } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ProoflineButton,
  ProoflineButtonGroup,
  ProoflineCheckbox,
  ProoflineField,
  ProoflineFilePicker,
  ProoflineIconButton,
  ProoflineInput,
  ProoflineLinkButton,
  ProoflineSwitch,
} from "../src";

describe("Proofline actions and forms", () => {
  it("keeps loading buttons named, busy, and disabled", () => {
    render(<ProoflineButton loading>Save evidence</ProoflineButton>);
    const button = screen.getByRole("button", { name: "Save evidence" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("requires an accessible label for icon-only actions", () => {
    render(
      <ProoflineIconButton label="Open settings">
        <Settings aria-hidden="true" />
      </ProoflineIconButton>,
    );
    expect(screen.getByRole("button", { name: "Open settings" })).toHaveAttribute(
      "data-tooltip",
      "Open settings",
    );
  });

  it("exposes links and grouped actions with native semantics", () => {
    render(
      <ProoflineButtonGroup label="Export actions">
        <ProoflineButton>Preview</ProoflineButton>
        <ProoflineLinkButton href="/evidence">Download</ProoflineLinkButton>
      </ProoflineButtonGroup>,
    );
    expect(screen.getByRole("group", { name: "Export actions" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/evidence");
  });

  it("connects field labels, descriptions, and errors", () => {
    render(
      <ProoflineField
        description="Public identifier"
        error="A name is required"
        htmlFor="name"
        label="Evaluation name"
        required
      >
        <ProoflineInput />
      </ProoflineField>,
    );
    expect(screen.getByLabelText(/Evaluation name/)).toHaveAttribute(
      "aria-describedby",
      "name-description name-error",
    );
    expect(screen.getByLabelText(/Evaluation name/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("A name is required");
  });

  it("uses native checkbox, switch, and file input semantics", () => {
    function Example() {
      const [enabled, setEnabled] = useState(false);
      return (
        <>
          <ProoflineCheckbox label="Include metadata" />
          <ProoflineSwitch
            checked={enabled}
            label="Enable validation"
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
          <ProoflineFilePicker accept=".json" label="Import evidence" />
        </>
      );
    }
    render(<Example />);
    fireEvent.click(screen.getByRole("switch", { name: "Enable validation" }));
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByLabelText("Import evidence")).toHaveAttribute("accept", ".json");
  });

  it("passes action handlers through", () => {
    const onClick = vi.fn();
    render(<ProoflineButton onClick={onClick}>Run</ProoflineButton>);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
