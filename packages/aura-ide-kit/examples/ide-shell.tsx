import {
  AuraIdeAppFrame,
  AuraInspector,
  AuraIntakePacketPreview,
  AuraMonaco,
  AuraProblemsPanel,
  AuraProjectTree,
  AuraStatusBar,
  AuraTabbedShell,
  AuraTelemetryEventLog,
  createDefaultIdeCommands,
} from "../src";
import "../src/styles.css";

const registry = createDefaultIdeCommands(
  () => console.info("open-folder"),
  () => console.info("settings"),
);

const tabs = [
  {
    id: "rubric",
    title: "rubric.toml",
    path: "/project/rubric.toml",
    dirty: true,
    content: <AuraMonaco value={'name = "Example"\nversion = "0.1.0"\n'} language="toml" />,
  },
];

export function AuraIdeExample() {
  return (
    <AuraIdeAppFrame
      productName="Rubric Studio Open"
      projectName="example-rubric"
      commands={registry}
      sidebar={
        <AuraProjectTree
          nodes={[
            {
              id: "root",
              name: "example-rubric",
              kind: "folder",
              path: "/project",
              expanded: true,
              children: [
                { id: "rubric", name: "rubric.toml", kind: "file", path: "/project/rubric.toml", dirty: true },
                { id: "criteria", name: "criteria", kind: "folder", path: "/project/criteria", badge: "4" },
              ],
            },
          ]}
          selectedId="rubric"
        />
      }
      main={<AuraTabbedShell tabs={tabs} activeTabId="rubric" onActiveTabChange={() => undefined} />}
      inspector={<AuraInspector title="Selection">Rubric metadata and project health render here.</AuraInspector>}
      bottomPanel={<AuraProblemsPanel problems={[]} />}
      statusBar={<AuraStatusBar items={[{ id: "branch", label: "main" }, { id: "privacy", label: "Telemetry", value: "off", tone: "success" }]} />}
    />
  );
}

export function AuraIdePacketExample() {
  return (
    <AuraIntakePacketPreview
      packet={{
        packetId: "pkt_example",
        flagship: "rubric-studio",
        schemaVersion: "1.0.0",
        payloadRoles: ["manifest", "criteria", "samples"],
        includedFiles: [{ path: "criteria/helpfulness.toml", role: "criteria", bytes: 1200 }],
        excludedPatterns: ["**/.env", "**/secrets/**"],
        warnings: [],
      }}
    />
  );
}

export function AuraIdeTelemetryExample() {
  return (
    <AuraTelemetryEventLog
      events={[
        {
          id: "evt_1",
          name: "project.opened",
          timestamp: new Date(0).toISOString(),
          optedIn: false,
          destination: "local",
          deliveryStatus: "would_send",
          payloadPreview: { flagship: "rubric-studio" },
        },
      ]}
    />
  );
}
