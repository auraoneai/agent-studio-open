import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ProoflineAuditTimeline,
  ProoflineBarChart,
  ProoflineButton,
  ProoflineChartFrame,
  ProoflineDataTable,
  ProoflineDecisionGate,
  ProoflineDialog,
  ProoflineEvidencePacket,
  ProoflinePopover,
  ProoflineTooltip,
} from "../src";

describe("Proofline evidence, charts, and overlays", () => {
  it("presents evidence and decision states as text", () => {
    render(
      <>
        <ProoflineDecisionGate
          decision="Needs review"
          rationale="Two threshold findings require approval."
          tone="review"
        />
        <ProoflineEvidencePacket
          items={[{ label: "Source commit", value: "abc123" }]}
          title="Release evidence"
        />
        <ProoflineAuditTimeline events={[{ id: "1", title: "Checked", timestamp: "2026-07-12" }]} />
      </>,
    );
    expect(screen.getByText("Needs review")).toBeVisible();
    expect(screen.getByText("Source commit")).toBeVisible();
    expect(screen.getByText("2026-07-12")).toHaveAttribute("datetime", "2026-07-12");
  });

  it("requires a data-table alternative for chart frames", () => {
    render(
      <ProoflineChartFrame
        table={
          <ProoflineDataTable
            caption="Score data"
            columns={[{ key: "value", header: "Value", cell: (row: { value: number }) => row.value }]}
            rowKey={(_, index) => String(index)}
            rows={[{ value: 42 }]}
          />
        }
        title="Scores"
      >
        <ProoflineBarChart data={[{ label: "Pass", value: 42 }]} />
      </ProoflineChartFrame>,
    );
    expect(screen.getByText("View data table")).toBeVisible();
    fireEvent.click(screen.getByText("View data table"));
    expect(screen.getByRole("table", { name: "Score data" })).toBeVisible();
  });

  it("dismisses dialogs with Escape and restores trigger focus", async () => {
    function Example() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button autoFocus>Open dialog</button>
          <ProoflineDialog onClose={() => setOpen(false)} open={open} title="Export evidence">
            <ProoflineButton>Confirm export</ProoflineButton>
          </ProoflineDialog>
        </>
      );
    }
    render(<Example />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const close = screen.getByRole("button", { name: "Close Export evidence" });
    const confirm = screen.getByRole("button", { name: "Confirm export" });
    expect(close).toHaveFocus();
    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Open dialog" })).toHaveFocus();
  });

  it("opens popovers with the correct disclosure semantics", () => {
    render(
      <ProoflinePopover label="More actions" trigger={<button type="button">More</button>}>
        Export JSON
      </ProoflinePopover>,
    );
    const trigger = screen.getByRole("button", { name: "More" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "More actions" })).toHaveTextContent("Export JSON");
  });

  it("connects tooltip content to its trigger", () => {
    render(
      <ProoflineTooltip content="Copies the checksum">
        <button type="button">Copy</button>
      </ProoflineTooltip>,
    );
    const tooltip = screen.getByRole("tooltip");
    expect(screen.getByRole("button", { name: "Copy" })).toHaveAttribute(
      "aria-describedby",
      tooltip.id,
    );
  });
});
