import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@monaco-editor/react", () => ({
  Editor: ({ value }: { value: string }) => (
    <textarea aria-label="JSON editor" readOnly value={value} />
  ),
}));

import { App, CompareMatrix, DiffView, Timeline } from "../App";
import { demoCompareResult, demoReplayResult } from "../data";
import type { TimelineEvent } from "../types";
import { resetStudioStore, useStudioStore } from "../store";

describe("Agent Studio Open app surface", () => {
  beforeEach(() => {
    resetStudioStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Proofline IDE shell and first-run wizard", () => {
    render(<App />);
    expect(screen.getByText("Agent Studio Open")).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "First-run wizard" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Agent Studio navigation" }),
    ).toBeTruthy();
  });

  it("exposes the evidence data network and update state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(
      screen.getByRole("button", { name: "Check for updates" }),
    );
    expect(
      await screen.findByText(
        "Browser edition cannot install signed desktop updates.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Data network/i })).toBeTruthy();
  });

  it("shows detected browser constraints and never offers a desktop edition switch", async () => {
    const user = userEvent.setup();
    useStudioStore.setState((current) => ({
      state: { ...current.state, edition: "desktop" },
    }));
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByLabelText("Runtime edition: browser")).toBeTruthy();
    expect(screen.getByText(/Browser edition disables stdio/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "STDIO" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByLabelText("Browser constraints")).toBeNull();
  });

  it("opens command palette and navigates to Ship/export", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /Command palette/i }));
    await user.click(
      screen.getByRole("button", { name: /Export GitHub Action/i }),
    );
    expect(screen.getByRole("heading", { name: "Ship" })).toBeTruthy();
    expect(screen.getByText("GitHub Action")).toBeTruthy();
  });

  it("reaches A2A and Data Network from the mobile More menu", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    const more = screen.getByRole("button", {
      name: "More workspace tools",
    });
    await user.click(more);
    expect(
      screen.getByRole("dialog", { name: "Workspace commands" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /Validate A2A contract/i }),
    );
    expect(
      screen.getByRole("heading", { name: "Validate agent handshake" }),
    ).toBeTruthy();
    expect(more.getAttribute("aria-current")).toBe("page");

    await user.click(more);
    await user.click(
      screen.getByRole("button", { name: /Open Data Network/i }),
    );
    expect(
      screen.getByRole("heading", { name: "Evidence data network" }),
    ).toBeTruthy();
  });

  it("traps command-palette focus, isolates the workspace, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    const trigger = screen.getByRole("button", { name: /Command palette/i });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Workspace commands" });
    const input = screen.getByRole("textbox", { name: "Search commands" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(document.querySelector(".workbench")?.hasAttribute("inert")).toBe(
      true,
    );
    expect(
      document.querySelector(".workbench")?.getAttribute("aria-hidden"),
    ).toBe("true");

    const dialogButtons = Array.from(dialog.querySelectorAll("button"));
    const lastButton = dialogButtons.at(-1) as HTMLButtonElement;
    lastButton.focus();
    await user.tab();
    expect(document.activeElement).toBe(input);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(lastButton);

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Workspace commands" }),
      ).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.querySelector(".workbench")?.hasAttribute("inert")).toBe(
      false,
    );
  });

  it("applies the same modal focus contract to trace-card export", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(
      screen.getAllByRole("button", { name: "Open Traces workspace" })[0],
    );
    const trigger = screen.getByRole("button", {
      name: "Export trace card",
    });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "No trace selected",
    });
    const close = screen.getByRole("button", {
      name: "Close trace card export",
    });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(dialog.querySelectorAll("button").length).toBeGreaterThan(1);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(
      screen.queryByRole("dialog", { name: "No trace selected" }),
    ).toBeNull();
  });

  it(
    "downloads the bundle and every per-card artifact through real controls",
    async () => {
      const user = userEvent.setup();
      const createObjectURL = vi.fn(() => "blob:agentstudio-export");
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: createObjectURL,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: revokeObjectURL,
      });
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => undefined);

      render(<App />);
      await user.click(screen.getByRole("button", { name: "Start" }));
      await user.click(
        screen.getByRole("button", { name: /Command palette/i }),
      );
      await user.click(
        screen.getByRole("button", { name: /Export GitHub Action/i }),
      );

      const expected = [
        ["GitHub Action", "agentstudio-github-action.zip"],
        ["JUnit", "junit.xml"],
        ["PR comment", "agentstudio-pr-comment.md"],
        ["AuraOne intake", "agentstudio-intake.zip"],
      ] as const;
      for (const [title, filename] of expected) {
        await user.click(
          screen.getByRole("button", { name: `Export ${title}` }),
        );
        expect(await screen.findByText(`Downloaded ${filename}`)).toBeTruthy();
      }
      await user.click(screen.getByRole("button", { name: "Export bundle" }));
      expect(
        await screen.findByText(
          "Downloaded agentstudio-export-bundle.zip",
        ),
      ).toBeTruthy();

      await user.click(
        screen.getAllByRole("button", { name: "Open Traces workspace" })[0],
      );
      await user.click(
        screen.getByRole("button", { name: "Export trace card" }),
      );
      const dialog = screen.getByRole("dialog", { name: "No trace selected" });
      await user.click(
        within(dialog).getByRole("button", { name: "Export trace card" }),
      );
      expect(
        await within(dialog).findByText("Downloaded trace-card.json"),
      ).toBeTruthy();
      expect(dialog.isConnected).toBe(true);
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      expect(
        screen.queryByRole("dialog", { name: "No trace selected" }),
      ).toBeNull();

      expect(click).toHaveBeenCalledTimes(6);
      expect(createObjectURL).toHaveBeenCalledTimes(6);
    },
    60_000,
  );

  it("keeps the trace-card modal open with a persistent export error", async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("download unavailable");
      }),
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(
      screen.getAllByRole("button", { name: "Open Traces workspace" })[0],
    );
    await user.click(
      screen.getByRole("button", { name: "Export trace card" }),
    );
    const dialog = screen.getByRole("dialog", { name: "No trace selected" });
    await user.click(
      within(dialog).getByRole("button", { name: "Export trace card" }),
    );

    expect(await within(dialog).findByText("download unavailable")).toBeTruthy();
    expect(dialog.isConnected).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("does not hide enabled controls from the accessibility tree", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(document.querySelector("button[aria-hidden='true']")).toBeNull();
    expect(
      document.querySelector(
        ".topbar button[aria-label='Open settings']",
      ),
    ).toBeNull();
  });

  it("keeps crash reporting off by default and allows explicit opt-in", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Open settings" }));

    const telemetry = screen.getByLabelText("Telemetry opt-in");
    const crashReports = screen.getByLabelText("Crash reports opt-in");
    expect((telemetry as HTMLInputElement).checked).toBe(false);
    expect((crashReports as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Crash reports off")).toBeTruthy();
    expect(screen.getByText("Recording locally")).toBeTruthy();
    expect(screen.getByText("Not sent")).toBeTruthy();
    expect(screen.getByText("No local telemetry events")).toBeTruthy();
    expect(screen.queryByText("Streaming")).toBeNull();
    expect(screen.queryByText("studio.boot")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Desktop only",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText("Passphrase-protected browser storage"),
    ).toBeTruthy();

    await user.click(telemetry);
    expect(screen.getAllByText("Local preview").length).toBeGreaterThan(0);
    expect(screen.getByText("Not sent")).toBeTruthy();
    await user.click(crashReports);
    expect((crashReports as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Crash reports opted in")).toBeTruthy();
  });

  it("virtualizes large trace timelines for 10k-turn sessions", () => {
    const events: TimelineEvent[] = Array.from(
      { length: 10_000 },
      (_, index) => ({
        id: `evt-${index}`,
        kind: index % 3 === 0 ? "tool-call" : "model",
        title: `Turn ${index}`,
        body: `Synthetic benchmark event ${index}`,
        timestamp: "09:41:00",
        latencyMs: index % 500,
      }),
    );

    render(<Timeline events={events} />);

    expect(screen.getByTestId("timeline-virtualized")).toBeTruthy();
  });

  it("renders deterministic replay evidence with technical baseline and candidate detail", () => {
    render(<DiffView result={demoReplayResult} />);

    expect(screen.getByTestId("replay-evidence")).toBeTruthy();
    expect(screen.getByText("7 passed")).toBeTruthy();
    expect(screen.getAllByText("Baseline")).toHaveLength(3);
    expect(screen.getAllByText("Candidate")).toHaveLength(3);
    expect(screen.getByText("refund_order response")).toBeTruthy();
    const baseline = screen.getByLabelText(
      "Baseline evidence for refund_order response",
    );
    const candidate = screen.getByLabelText(
      "Candidate evidence for refund_order response",
    );
    expect(baseline.getAttribute("tabindex")).toBe("0");
    expect(candidate.getAttribute("tabindex")).toBe("0");
  });

  it("renders a populated cross-model comparison matrix", () => {
    render(
      <CompareMatrix
        selectedModels={["claude-opus-4-7", "gpt-5.5"]}
        result={demoCompareResult}
      />,
    );

    expect(screen.getByTestId("comparison-evidence")).toBeTruthy();
    expect(screen.getAllByText("Tool sequence")).toHaveLength(2);
    expect(screen.getAllByText("Retry behavior")).toHaveLength(2);
    expect(screen.getAllByText("refund approved")).toHaveLength(4);
  });

  it("exposes a compact mobile primary navigation without duplicating the desktop sidebar structure", () => {
    render(<App />);

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Agent Studio mobile navigation",
    });
    expect(mobileNavigation.querySelectorAll("button")).toHaveLength(6);
    expect(mobileNavigation.textContent).toContain("Connect");
    expect(mobileNavigation.textContent).toContain("Traces");
    expect(mobileNavigation.textContent).toContain("Replay");
    expect(mobileNavigation.textContent).toContain("Compare");
    expect(mobileNavigation.textContent).toContain("Ship");
    expect(mobileNavigation.textContent).toContain("More");
  });

  it("renders responsive trace and Ship proof summaries without requiring scripted scrolling", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(
      screen.getAllByRole("button", { name: "Open Traces workspace" })[0],
    );
    expect(screen.getByTestId("mobile-trace-proof").textContent).toContain(
      "tool calls",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Open Ship workspace" })[0],
    );
    expect(screen.getByTestId("mobile-ship-proof").textContent).toContain(
      "5 artifacts",
    );
    expect(screen.getByTestId("mobile-ship-proof").textContent).toContain(
      "Trace card",
    );
  });

  it("keeps timeline event kind, time, and stable numeric metadata visible", () => {
    render(
      <Timeline
        events={[
          {
            id: "evt-tool-1",
            kind: "tool-call",
            title: "lookup_order",
            body: '{"order_id":"ORD-1842"}',
            timestamp: "09:41:05",
            latencyMs: 118,
          },
        ]}
      />,
    );

    expect(screen.getByText("tool call")).toBeTruthy();
    expect(screen.getByText("09:41:05")).toBeTruthy();
    expect(screen.getByText("latency 118 ms")).toBeTruthy();
    expect(screen.getByText("cost —")).toBeTruthy();
    expect(screen.getByText("event evt-tool-1")).toBeTruthy();
  });

  it("does not fake local tool execution before a runtime MCP manifest is connected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /Compose/i }));
    await user.click(screen.getByRole("button", { name: /^Send$/i }));
    expect(
      await screen.findByText(
        /Connect to an MCP server before sending a tool call/i,
      ),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /Stream with model/i }),
    );
    expect(await screen.findByText(/Use the CLI model command/i)).toBeTruthy();
  });
});
