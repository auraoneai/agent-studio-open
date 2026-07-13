import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ProoflineBreadcrumbs,
  ProoflineCommandPalette,
  ProoflineDataTable,
  ProoflineMenu,
  ProoflinePagination,
  ProoflineTabs,
} from "../src";

describe("Proofline navigation and data", () => {
  it("marks the current breadcrumb page", () => {
    render(<ProoflineBreadcrumbs items={[{ label: "Open", href: "/open" }, { label: "Evidence" }]} />);
    expect(screen.getByText("Evidence")).toHaveAttribute("aria-current", "page");
  });

  it("supports arrow-key tab selection and skips disabled tabs", () => {
    function Example() {
      const [value, setValue] = useState("review");
      return (
        <ProoflineTabs
          items={[
            { id: "review", label: "Review" },
            { id: "disabled", label: "Unavailable", disabled: true },
            { id: "evidence", label: "Evidence" },
          ]}
          onValueChange={setValue}
          value={value}
        />
      );
    }
    render(<Example />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute("aria-selected", "true");
  });

  it("filters command palette commands and closes with Escape", () => {
    const onClose = vi.fn();
    render(
      <ProoflineCommandPalette
        commands={[
          { id: "export", label: "Export evidence" },
          { id: "settings", label: "Open settings" },
        ]}
        onClose={onClose}
        onSelect={vi.fn()}
        open
      />,
    );
    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "export" } });
    expect(screen.getByRole("menuitem", { name: "Export evidence" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Open settings" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders a captioned semantic data table and pagination labels", () => {
    const onPageChange = vi.fn();
    render(
      <>
        <ProoflineDataTable
          caption="Evaluation results"
          columns={[{ key: "score", header: "Score", cell: (row: { score: number }) => row.score }]}
          rowKey={(_, index) => String(index)}
          rows={[{ score: 0.92 }]}
        />
        <ProoflinePagination onPageChange={onPageChange} page={2} pageCount={3} />
      </>,
    );
    expect(screen.getByRole("table", { name: "Evaluation results" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("supports arrow-key navigation within menus", () => {
    render(
      <ProoflineMenu
        items={[
          { id: "open", label: "Open" },
          { id: "disabled", label: "Disabled", disabled: true },
          { id: "export", label: "Export" },
        ]}
        label="File actions"
        onSelect={vi.fn()}
      />,
    );
    const open = screen.getByRole("menuitem", { name: "Open" });
    open.focus();
    fireEvent.keyDown(open, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Export" })).toHaveFocus();
  });
});
