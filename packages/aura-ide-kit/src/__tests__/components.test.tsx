import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AuraIdeAppFrame,
  AuraFileWatcherStatus,
  AuraIntakeIdentityFields,
  AuraIntakePacketPreview,
  AuraKeychainFallbackWarning,
  AuraProblemsPanel,
  AuraProjectTree,
  AuraStatusBar,
  AuraTabbedShell,
  AuraTelemetryEventLog,
  AuraUpdatePrompt,
  AuraWelcomePrivacyWizard,
  AuraWelcomeWindow,
} from "../components";
import { createCommandRegistry } from "../command-registry";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value: string }) => <textarea aria-label="Monaco editor" defaultValue={value} />,
}));

describe("Aura IDE components", () => {
  it("renders the app frame with command palette affordance and status bar", () => {
    render(
      <AuraIdeAppFrame
        productName="Rubric Studio Open"
        projectName="rubric-demo"
        commands={createCommandRegistry()}
        sidebar={<AuraProjectTree nodes={[]} />}
        main={<div>Workbench</div>}
        statusBar={<AuraStatusBar items={[{ id: "ready", label: "Ready", value: "local" }]} />}
      />,
    );

    expect(screen.getByText("Rubric Studio Open")).toBeInTheDocument();
    expect(screen.getByText("rubric-demo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open command palette/i })).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
  });

  it("renders project tree badges and tab dirty state", () => {
    render(
      <AuraTabbedShell
        tabs={[
          {
            id: "one",
            title: "rubric.toml",
            dirty: true,
            content: (
              <AuraProjectTree
                selectedId="criteria"
                nodes={[
                  {
                    id: "root",
                    name: "project",
                    path: "/project",
                    kind: "folder",
                    children: [{ id: "criteria", name: "criteria", path: "/project/criteria", kind: "folder", badge: "3" }],
                  },
                ]}
              />
            ),
          },
        ]}
        activeTabId="one"
        onActiveTabChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: /rubric.toml/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("criteria")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders problems and intake packet previews", () => {
    const consent = vi.fn();
    render(
      <>
        <AuraProblemsPanel problems={[{ id: "p1", severity: "error", source: "schema", message: "Missing manifest", path: "rubric.toml", line: 1 }]} />
        <AuraIntakePacketPreview
          packet={{
            packetId: "pkt_1",
            flagship: "rubric-studio",
            schemaVersion: "1.0.0",
            payloadRoles: ["criteria"],
            includedFiles: [{ path: "criteria/a.toml", role: "criteria", bytes: 120 }],
            excludedPatterns: ["**/.env"],
            warnings: ["One warning"],
          }}
          manifestTree={{ manifest: { contact: { display_name: "User supplied" }, payload_manifest: ["criteria/a.toml"] } }}
          consentChecked={false}
          onConsentChange={consent}
        />
      </>,
    );

    expect(screen.getByText("Missing manifest")).toBeInTheDocument();
    expect(screen.getByText("pkt_1")).toBeInTheDocument();
    expect(screen.getByText("**/.env")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /manifest tree/i })).toHaveTextContent("payload_manifest");
    expect(screen.getByText("A manifest describing the project metadata you entered.")).toBeInTheDocument();
    expect(screen.getByText("File paths from your machine (replaced with <PROJECT>/... references).")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read the intake privacy policy/i })).toHaveAttribute("href", "https://auraone.ai/open/privacy/intake");
    const checkbox = screen.getByLabelText(/i reviewed this packet/i);
    expect(checkbox).toBeRequired();
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(consent).toHaveBeenCalledWith(true);
  });

  it("renders file watcher and welcome window controls", () => {
    const openFolder = vi.fn();
    const openRecent = vi.fn();
    render(
      <>
        <AuraFileWatcherStatus state="connected" watchedPath="/workspace/rubric" eventsQueued={2} />
        <AuraWelcomeWindow
          productName="Rubric Studio Open"
          recentProjects={[{ name: "demo", path: "/workspace/demo" }]}
          onOpenFolder={openFolder}
          onOpenRecent={openRecent}
        />
      </>,
    );

    expect(screen.getByLabelText("File watcher status")).toHaveTextContent("Watching");
    expect(screen.getByText("2 queued")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open folder/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /recent projects/i })).toHaveTextContent("demo");
  });

  it("renders default-off privacy choices and mandatory update actions", () => {
    render(
      <>
        <AuraWelcomePrivacyWizard
          telemetryEnabled={false}
          crashReportsEnabled={false}
          onTelemetryChange={vi.fn()}
          onCrashReportsChange={vi.fn()}
          onComplete={vi.fn()}
        />
        <AuraUpdatePrompt
          version="0.1.1"
          releaseNotes="Security fixes"
          signedBy="AuraOne"
          mandatory
          onInstallNow={vi.fn()}
          onInstallOnRestart={vi.fn()}
          onRemindLater={vi.fn()}
        />
      </>,
    );

    expect(screen.getByLabelText(/help improve auraone open studio/i)).not.toBeChecked();
    expect(screen.getByLabelText(/send crash reports/i)).not.toBeChecked();
    expect(screen.getByText("Anything you typed into the editor")).toBeInTheDocument();
    expect(screen.getByText("Signed by AuraOne")).toHaveAttribute("title", "Signed by AuraOne");
    expect(screen.getByRole("button", { name: /install next launch/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /install now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remind later/i })).toBeDisabled();
  });

  it("renders user-supplied intake identity fields without inferred defaults", () => {
    const setDisplayName = vi.fn();
    const setEmail = vi.fn();
    const setIntent = vi.fn();
    render(
      <AuraIntakeIdentityFields
        displayName=""
        email=""
        intent=""
        onDisplayNameChange={setDisplayName}
        onEmailChange={setEmail}
        onIntentChange={setIntent}
      />,
    );

    expect(screen.getByLabelText("Display name")).toHaveValue("");
    expect(screen.getByLabelText("Email (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Intent note")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "User supplied" } });
    fireEvent.change(screen.getByLabelText("Email (optional)"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Intent note"), { target: { value: "Cloud handoff" } });

    expect(setDisplayName).toHaveBeenCalledWith("User supplied");
    expect(setEmail).toHaveBeenCalledWith("user@example.com");
    expect(setIntent).toHaveBeenCalledWith("Cloud handoff");
  });

  it("renders linux keychain fallback warning only on first fallback secret", () => {
    const dismiss = vi.fn();
    const { rerender } = render(
      <AuraKeychainFallbackWarning backendKind="linux-secret-service" firstSecretSet onDismiss={dismiss} />,
    );
    expect(screen.queryByRole("status", { name: /linux keychain fallback warning/i })).not.toBeInTheDocument();

    rerender(<AuraKeychainFallbackWarning backendKind="linux-encrypted-file-fallback" firstSecretSet onDismiss={dismiss} />);

    expect(screen.getByRole("status", { name: /linux keychain fallback warning/i })).toHaveTextContent("Linux Secret Service is unavailable");
    expect(screen.getByText(/encrypted local fallback store/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("renders truthful telemetry delivery states and an accessible empty log", () => {
    const { rerender } = render(<AuraTelemetryEventLog events={[]} />);

    expect(screen.getByText("No local events")).toBeInTheDocument();
    expect(screen.getByText(/does not confirm network delivery/i)).toBeInTheDocument();

    rerender(
      <AuraTelemetryEventLog
        events={[
          {
            id: "event-1",
            name: "feature_used",
            timestamp: "2026-05-13T12:00:00.000Z",
            optedIn: true,
            destination: "local",
            deliveryStatus: "local_preview",
            payloadPreview: { feature_id: "rubric.preview" },
          },
          {
            id: "event-2",
            name: "app_launched",
            timestamp: "2026-05-13T12:01:00.000Z",
            optedIn: false,
            destination: "local",
            deliveryStatus: "would_send",
            payloadPreview: {},
          },
        ]}
      />,
    );

    expect(screen.getByText("local preview")).toBeInTheDocument();
    expect(screen.getByText("not sent")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /feature_used payload preview/i })).toHaveAttribute("tabindex", "0");
  });
});
