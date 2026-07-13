import axe from "axe-core";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AuraIdeAppFrame,
  AuraIntakePacketPreview,
  AuraProblemsPanel,
  AuraProjectTree,
  AuraStatusBar,
  AuraTabbedShell,
  AuraTelemetryEventLog,
} from "../components";
import { createCommandRegistry } from "../command-registry";
import { AURA_IDE_COMPONENT_POSTURE, postureFor } from "../ssr-posture";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value: string }) => <textarea aria-label="Monaco editor" defaultValue={value} />,
}));

describe("Aura IDE accessibility and SSR posture", () => {
  it("declares SSR posture for every exported IDE component", () => {
    const expected = [
      "AuraIdeAppFrame",
      "AuraSplitPane",
      "AuraProjectTree",
      "AuraMonaco",
      "AuraTimeline",
      "AuraInspector",
      "AuraCommandPalette",
      "AuraStatusBar",
      "AuraProblemsPanel",
      "AuraSettingsPanel",
      "AuraWelcomePrivacyWizard",
      "AuraUpdatePrompt",
      "AuraIntakeIdentityFields",
      "AuraKeychainFallbackWarning",
      "AuraToastProvider",
      "AuraModal",
      "AuraEmptyState",
      "AuraLoadingState",
      "AuraErrorState",
      "AuraTelemetryEventLog",
      "AuraIntakePacketPreview",
      "AuraFileWatcherStatus",
      "AuraWelcomeWindow",
      "AuraTabbedShell",
    ];

    expect(AURA_IDE_COMPONENT_POSTURE).toHaveLength(expected.length);
    for (const component of expected) {
      expect(postureFor(component)?.posture).toMatch(/^(ssr-safe|client-only|client-only-with-suspense)$/);
    }
  });

  it("passes axe-core checks for the shared IDE shell composition", async () => {
    const { container } = render(
      <AuraIdeAppFrame
        productName="Rubric Studio Open"
        projectName="rubric-demo"
        commands={createCommandRegistry()}
        sidebar={
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
        }
        main={
          <AuraTabbedShell
            activeTabId="preview"
            onActiveTabChange={vi.fn()}
            tabs={[
              {
                id: "preview",
                title: "Packet",
                content: (
                  <AuraIntakePacketPreview
                    packet={{
                      packetId: "pkt_1",
                      flagship: "rubric-studio",
                      schemaVersion: "1.0.0",
                      payloadRoles: ["criteria"],
                      includedFiles: [{ path: "criteria/a.toml", role: "criteria", bytes: 120 }],
                      excludedPatterns: ["**/.env"],
                      warnings: [],
                    }}
                  />
                ),
              },
            ]}
          />
        }
        bottomPanel={
          <>
            <AuraProblemsPanel problems={[{ id: "p1", severity: "info", source: "schema", message: "Ready" }]} />
            <AuraTelemetryEventLog
              events={[
                {
                  id: "event-1",
                  name: "feature_used",
                  timestamp: "2026-05-13T12:00:00.000Z",
                  optedIn: true,
                  destination: "local",
                  deliveryStatus: "local_preview",
                  payloadPreview: { feature_id: "rubric.preview", result: "recorded locally" },
                },
              ]}
            />
          </>
        }
        statusBar={<AuraStatusBar items={[{ id: "ready", label: "Ready", value: "local" }]} />}
      />,
    );

    const results = await axe.run(container, {
      rules: {
        // JSDOM cannot reliably compute stylesheet-derived contrast.
        "color-contrast": { enabled: false },
      },
    });

    expect(results.violations).toEqual([]);
  });
});
