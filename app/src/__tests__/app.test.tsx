import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@monaco-editor/react", () => ({
  Editor: ({ value }: { value: string }) => <textarea aria-label="JSON editor" readOnly value={value} />,
}));

import { App, Timeline } from "../App";
import type { TimelineEvent } from "../types";
import { resetStudioStore } from "../store";

describe("Agent Studio Open app surface", () => {
  beforeEach(() => {
    resetStudioStore();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the AuraGlass-style IDE shell and first-run wizard", () => {
    render(<App />);
    expect(screen.getByText("Agent Studio Open")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "First-run wizard" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Agent Studio navigation" })).toBeTruthy();
  });

  it("shows browser edition constraints and blocks stdio connection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByLabelText("Browser constraints"));
    expect(screen.getByText(/Browser edition disables stdio/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Connect$/i }));
    expect(screen.getByText("Browser edition cannot use stdio. Choose SSE, HTTP, or WebSocket.")).toBeTruthy();
  });

  it("opens command palette and navigates to Ship/export", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /Command palette/i }));
    await user.click(screen.getByRole("button", { name: /Export GitHub Action/i }));
    expect(screen.getByRole("heading", { name: "Ship" })).toBeTruthy();
    expect(screen.getByText("GitHub Action")).toBeTruthy();
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

    await user.click(crashReports);
    expect((crashReports as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Crash reports opted in")).toBeTruthy();
  });

  it("virtualizes large trace timelines for 10k-turn sessions", () => {
    const events: TimelineEvent[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `evt-${index}`,
      kind: index % 3 === 0 ? "tool-call" : "model",
      title: `Turn ${index}`,
      body: `Synthetic benchmark event ${index}`,
      timestamp: "09:41:00",
      latencyMs: index % 500,
    }));

    render(<Timeline events={events} />);

    expect(screen.getByTestId("timeline-virtualized")).toBeTruthy();
  });

  it("sends a valid local tool call and appends response output", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: /Compose/i }));
    await user.click(screen.getByRole("button", { name: /^Send$/i }));
    expect(await screen.findByText(/Refund queued with customer notification/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Stream with model/i }));
    expect(await screen.findByText(/Streaming final response/i)).toBeTruthy();
  });
});
