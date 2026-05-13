import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Editor } from "@monaco-editor/react";
import { Virtuoso } from "react-virtuoso";
import {
  TelemetryEventLog,
  type TelemetryLogEntry,
} from "../../../open-studio-platform/packages/platform-contracts/src/event-log";
import { createTelemetryEvent } from "../../../open-studio-platform/packages/platform-contracts/src/telemetry";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronsRight,
  Command,
  Download,
  Eye,
  FileJson,
  GitCompare,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  Workflow,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  a2aResults,
  buildExportBundle,
  capabilities,
  filterSessions,
  models,
  sampleManifest,
  sampleToolPayload,
  spans,
  summarizeSession,
  surfaces,
  traceSessions,
  validateJson,
} from "./data";
import { useStudioStore } from "./store";
import type { ConnectionDraft, Edition, ExportBundle, Surface, Theme, TimelineEvent } from "./types";

const initialConnection: ConnectionDraft = {
  name: "support-crm-mcp",
  transport: "stdio",
  command: "python",
  args: "-m support_crm_mcp",
  cwd: "~/agent-projects/support-crm",
  url: "https://support.example.com/mcp",
  headers: '{"Authorization":"Bearer ${MCP_TOKEN}"}',
};

const surfaceIcons: Record<Surface, typeof Radio> = {
  connect: Radio,
  compose: Send,
  traces: FileJson,
  replay: RefreshCw,
  a2a: Workflow,
  observe: Activity,
  compare: GitCompare,
  ship: Download,
  settings: Settings,
};

const surfaceCommands: Array<{ id: string; title: string; surface: Surface; key: string }> = [
  { id: "connect", title: "Open connection panel", surface: "connect", key: "Cmd/Ctrl+1" },
  { id: "compose", title: "New compose request", surface: "compose", key: "Cmd/Ctrl+N" },
  { id: "traces", title: "Open trace browser", surface: "traces", key: "Cmd/Ctrl+3" },
  { id: "replay", title: "Replay selected trace", surface: "replay", key: "Cmd/Ctrl+R" },
  { id: "compare", title: "Compare model behavior", surface: "compare", key: "Cmd/Ctrl+D" },
  { id: "ship", title: "Export GitHub Action", surface: "ship", key: "Cmd/Ctrl+Shift+E" },
  { id: "settings", title: "Open settings", surface: "settings", key: "Cmd/Ctrl+," },
];

function createUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const random = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `${random}-1000-4000-8000-${random}${random.slice(0, 4)}`;
}

function platformOs(): "darwin" | "windows" | "linux" {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) {
    return "darwin";
  }
  if (platform.includes("win")) {
    return "windows";
  }
  return "linux";
}

function platformArch(): "x86_64" | "aarch64" {
  return /x86|win64|amd64/i.test(navigator.userAgent) ? "x86_64" : "aarch64";
}

export function App() {
  const state = useStudioStore((store) => store.state);
  const setState = useStudioStore((store) => store.setState);
  const [connection, setConnection] = useState<ConnectionDraft>(initialConnection);
  const [jsonValue, setJsonValue] = useState(sampleToolPayload);
  const [sequence, setSequence] = useState(["lookup_order", "refund_order"]);
  const [lastResponse, setLastResponse] = useState("No response yet. Send a tool call or run an agent loop.");
  const [streamingResponse, setStreamingResponse] = useState("No streaming response yet.");
  const [traceCardModalOpen, setTraceCardModalOpen] = useState(false);
  const [telemetryOptIn, setTelemetryOptIn] = useState(false);
  const [crashReportsOptIn, setCrashReportsOptIn] = useState(false);
  const [telemetryLog] = useState(() => new TelemetryEventLog());
  const [telemetryEntries, setTelemetryEntries] = useState<readonly TelemetryLogEntry[]>([]);
  const [sessionId] = useState(() => createUuid());
  const [installId] = useState(() => createUuid());
  const [exportBundle] = useState<ExportBundle>(() => buildExportBundle(traceSessions));

  const selectedTrace = traceSessions.find((session) => session.id === state.selectedTraceId) ?? traceSessions[0];
  const selectedTool = sampleManifest.tools.find((tool) => tool.name === state.selectedToolName) ?? sampleManifest.tools[0];
  const filteredSessions = useMemo(() => filterSessions(traceSessions, state.search), [state.search]);
  const jsonValidation = useMemo(() => validateJson(jsonValue), [jsonValue]);
  const auraTheme = state.theme === "contrast" ? "high-contrast" : state.theme;

  useEffect(() => {
    document.documentElement.dataset.theme = auraTheme;
    document.documentElement.dataset.edition = state.edition;
  }, [auraTheme, state.edition]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setState((current) => ({ ...current, commandPaletteOpen: true }));
      }
      if (mod && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setState((current) => ({ ...current, activeSurface: "compose" }));
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setState((current) => ({ ...current, recording: !current.recording }));
      }
      if (mod && event.key.toLowerCase() === "r" && !event.shiftKey) {
        event.preventDefault();
        setState((current) => ({ ...current, activeSurface: "replay", loadingOperation: "replaying" }));
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setState((current) => ({ ...current, activeSurface: "compare" }));
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setState((current) => ({ ...current, activeSurface: "ship" }));
      }
      if (mod && event.key === ",") {
        event.preventDefault();
        setState((current) => ({ ...current, activeSurface: "settings" }));
      }
      if (mod && /^[1-8]$/.test(event.key)) {
        event.preventDefault();
        const surface = surfaces[Number(event.key) - 1]?.id;
        if (surface) {
          setState((current) => ({ ...current, activeSurface: surface }));
        }
      }
      if (event.key === "?" && !mod) {
        setState((current) => ({ ...current, commandPaletteOpen: true }));
      }
      if (event.key === "Escape") {
        setState((current) => ({
          ...current,
          commandPaletteOpen: false,
          firstRunOpen: false,
          loadingOperation: null,
          errorMessage: null,
        }));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runOperation = (loadingOperation: string, nextSurface?: Surface) => {
    setState((current) => ({ ...current, loadingOperation, activeSurface: nextSurface ?? current.activeSurface }));
    window.setTimeout(() => setState((current) => ({ ...current, loadingOperation: null })), 450);
  };

  const recordTelemetrySurface = (surface: "mcp" | "otlp" | "a2a" | "llm_gateway" | "intake") => {
    telemetryLog.record(
      createTelemetryEvent({
        eventName: "agent_protocol_surface_used",
        eventId: createUuid(),
        timestamp: new Date().toISOString(),
        sessionId,
        app: { flagship: "agent-studio-open", version: "0.1.0", channel: "beta" },
        device: {
          install_id: installId,
          os: platformOs(),
          os_version: navigator.platform || "unknown",
          arch: platformArch(),
        },
        payload: { surface },
      }),
      telemetryOptIn,
    );
    setTelemetryEntries([...telemetryLog.list()]);
  };

  const handleTelemetryOptInChange = (enabled: boolean) => {
    setTelemetryOptIn(enabled);
    if (!enabled) {
      telemetryLog.clear();
      setTelemetryEntries([]);
    }
  };

  const setError = (message: string) => {
    setState((current) => ({ ...current, errorMessage: message }));
  };

  const runConnect = () => {
    if (state.edition === "browser" && connection.transport === "stdio") {
      setState((current) => ({
        ...current,
        errorMessage: "Browser edition cannot use stdio. Choose SSE, HTTP, or WebSocket.",
      }));
      return;
    }
    recordTelemetrySurface("mcp");
    runOperation("connecting");
  };

  const runToolCall = () => {
    if (!jsonValidation.ok) {
      setError(`Tool call failed: ${jsonValidation.message}`);
      return;
    }
    setLastResponse(
      JSON.stringify(
        {
          ok: true,
          tool: selectedTool.name,
          trace_id: "trace-live-local",
          recorded: state.recording,
          result: selectedTool.name === "refund_order" ? "Refund queued with customer notification." : "Tool call accepted.",
        },
        null,
        2,
      ),
    );
    recordTelemetrySurface("mcp");
    runOperation("sending tool call");
  };

  const runStreamingModel = () => {
    recordTelemetrySurface("llm_gateway");
    setStreamingResponse("");
    ["Planning refund check. ", "Calling refund_order. ", "Streaming final response."].forEach((chunk, index) => {
      window.setTimeout(() => setStreamingResponse((current) => current + chunk), index * 120);
    });
    runOperation("streaming model response");
  };

  const toggleModel = (model: string) => {
    setState((current) => {
      const exists = current.selectedModels.includes(model);
      const selectedModels = exists
        ? current.selectedModels.filter((item) => item !== model)
        : [...current.selectedModels, model];
      return { ...current, selectedModels };
    });
  };

  return (
    <div className="studio-shell aura-ide-root" data-theme={auraTheme}>
      <aside className="sidebar" aria-label="Agent Studio Open navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            AS
          </div>
          <div>
            <strong>Agent Studio Open</strong>
            <span>{state.edition === "desktop" ? "Desktop IDE" : "Browser edition"}</span>
          </div>
        </div>
        <nav aria-label="Agent Studio navigation">
          {surfaces.map((surface) => {
            const Icon = surfaceIcons[surface.id];
            return (
              <button
                className={state.activeSurface === surface.id ? "nav-item active" : "nav-item"}
                key={surface.id}
                onClick={() => setState((current) => ({ ...current, activeSurface: surface.id }))}
                aria-current={state.activeSurface === surface.id ? "page" : undefined}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{surface.label}</span>
                <kbd>{surface.shortcut}</kbd>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button
            className="ghost-button"
            onClick={() => setState((current) => ({ ...current, commandPaletteOpen: true }))}
          >
            <Command aria-hidden="true" size={16} />
            Command palette
          </button>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={state.edition === "browser"}
              onChange={(event) =>
                setState((current) => ({ ...current, edition: event.target.checked ? "browser" : "desktop" }))
              }
            />
            Browser constraints
          </label>
        </div>
      </aside>

      <main className="workbench">
        <header className="topbar">
          <button className="palette-button" onClick={() => setState((current) => ({ ...current, commandPaletteOpen: true }))}>
            <Search aria-hidden="true" size={18} />
            Search commands, traces, tools
            <kbd>Cmd K</kbd>
          </button>
          <div className="topbar-actions">
            <StatusPill tone={state.recording ? "danger" : "neutral"} label={state.recording ? "Recording" : "Idle"} />
            <button className="icon-button" aria-label="Toggle recording" onClick={() => setState((current) => ({ ...current, recording: !current.recording }))}>
              <Radio aria-hidden="true" size={18} />
            </button>
            <button className="icon-button" aria-label="Open settings" onClick={() => setState((current) => ({ ...current, activeSurface: "settings" }))}>
              <Settings aria-hidden="true" size={18} />
            </button>
          </div>
        </header>

        {state.loadingOperation && <OperationBanner label={state.loadingOperation} />}
        {state.errorMessage && <ErrorBanner message={state.errorMessage} onClose={() => setState((current) => ({ ...current, errorMessage: null }))} />}

        {state.activeSurface === "connect" && (
          <Section title="Connect & Inspect" eyebrow="MCP stdio, SSE, HTTP, WebSocket">
            <div className="two-column">
              <Panel title="Connection">
                <div className="segmented" role="group" aria-label="Transport">
                  {(["stdio", "sse", "http", "websocket"] as const).map((transport) => {
                    const blocked = state.edition === "browser" && transport === "stdio";
                    return (
                      <button
                        key={transport}
                        disabled={blocked}
                        className={connection.transport === transport ? "selected" : ""}
                        onClick={() => setConnection((current) => ({ ...current, transport }))}
                      >
                        {transport.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <Field label="Name" value={connection.name} onChange={(value) => setConnection((current) => ({ ...current, name: value }))} />
                {connection.transport === "stdio" ? (
                  <>
                    <Field label="Command" value={connection.command} onChange={(value) => setConnection((current) => ({ ...current, command: value }))} />
                    <Field label="Args" value={connection.args} onChange={(value) => setConnection((current) => ({ ...current, args: value }))} />
                    <Field label="Working directory" value={connection.cwd} onChange={(value) => setConnection((current) => ({ ...current, cwd: value }))} />
                  </>
                ) : (
                  <>
                    <Field label="URL" value={connection.url} onChange={(value) => setConnection((current) => ({ ...current, url: value }))} />
                    <Field label="Headers" value={connection.headers} onChange={(value) => setConnection((current) => ({ ...current, headers: value }))} />
                  </>
                )}
                <div className="button-row">
                  <button className="primary-button" onClick={runConnect}>
                    <Play aria-hidden="true" size={16} />
                    Connect
                  </button>
                  <button className="secondary-button" onClick={() => runOperation("risk scanning")}>
                    <Shield aria-hidden="true" size={16} />
                    Risk scan
                  </button>
                  <button className="secondary-button" onClick={() => setError("Connection failed: server exited before initialize. Retry, edit command, or view logs.")}>
                    View failure
                  </button>
                </div>
                {state.edition === "browser" && <Notice>Browser edition disables stdio and the local OTLP receiver; remote SSE, HTTP, WebSocket, A2A, and IndexedDB storage remain available.</Notice>}
                <LogPanel />
              </Panel>
              <Panel title="Manifest inspector">
                <ManifestInspector />
              </Panel>
            </div>
          </Section>
        )}

        {state.activeSurface === "compose" && (
          <Section title="Send & Test" eyebrow="Schema-aware tool calls with model-loop context">
            <div className="compose-grid">
              <Panel title="Tool picker">
                <div className="tool-list" role="listbox" aria-label="Tools">
                  {sampleManifest.tools.map((tool) => (
                    <button
                      key={tool.name}
                      className={state.selectedToolName === tool.name ? "tool active" : "tool"}
                      onClick={() => setState((current) => ({ ...current, selectedToolName: tool.name }))}
                    >
                      <span>{tool.title}</span>
                      <RiskBadges findings={tool.risk} />
                    </button>
                  ))}
                </div>
                <SchemaForm schema={selectedTool.inputSchema} />
              </Panel>
              <Panel title="JSON editor">
                <div className="editor-frame">
                  <Editor
                    height="300px"
                    defaultLanguage="json"
                    theme={state.theme === "light" ? "light" : "vs-dark"}
                    value={jsonValue}
                    onChange={(value) => setJsonValue(value ?? "")}
                    options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, wordWrap: "on" }}
                  />
                </div>
                <StatusPill tone={jsonValidation.ok ? "success" : "danger"} label={jsonValidation.ok ? "Valid JSON" : jsonValidation.message} />
                <div className="sequence-builder">
                  <strong>Sequence builder</strong>
                  {sequence.map((item, index) => (
                    <button key={`${item}-${index}`} onClick={() => setSequence((current) => current.filter((_, idx) => idx !== index))}>
                      {index + 1}. {item}
                    </button>
                  ))}
                  <button onClick={() => setSequence((current) => [...current, selectedTool.name])}>Add {selectedTool.name}</button>
                </div>
              </Panel>
              <Panel title="Response & agent loop">
                <Timeline events={selectedTrace.events} />
                <CodeBlock value={lastResponse} />
                <div className="button-row">
                  <button className="primary-button" onClick={runToolCall}>
                    <Send aria-hidden="true" size={16} />
                    Send
                  </button>
                  <button className="secondary-button" onClick={() => runOperation("running agent loop with model")}>
                    <ChevronsRight aria-hidden="true" size={16} />
                    Send with model
                  </button>
                  <button className="secondary-button" onClick={runStreamingModel}>
                    <ChevronsRight aria-hidden="true" size={16} />
                    Stream with model
                  </button>
                </div>
                <CodeBlock value={streamingResponse} />
              </Panel>
            </div>
          </Section>
        )}

        {state.activeSurface === "traces" && (
          <Section title="Trace Browser" eyebrow="Sessions, filters, full-text search">
            <TraceBrowser search={state.search} setSearch={(search) => setState((current) => ({ ...current, search }))} selectedTraceId={state.selectedTraceId} onSelect={(selectedTraceId) => setState((current) => ({ ...current, selectedTraceId }))} sessions={filteredSessions} />
          </Section>
        )}

        {state.activeSurface === "replay" && (
          <Section title="Record & Replay" eyebrow="Deterministic regression runs">
            <div className="two-column">
              <Panel title="Replay controls">
                <TraceSummary traceId={selectedTrace.id} />
                <div className="button-row">
                  <button className="primary-button" onClick={() => runOperation("replaying")}>
                    <RefreshCw aria-hidden="true" size={16} />
                    Replay
                  </button>
                  <button className="secondary-button" onClick={() => setState((current) => ({ ...current, errorMessage: "Replay nondeterminism detected: refund_order returned a different retry count." }))}>
                    <AlertTriangle aria-hidden="true" size={16} />
                    Simulate nondeterminism
                  </button>
                </div>
                <Timeline events={selectedTrace.events} />
              </Panel>
              <Panel title="Diff view">
                <DiffView />
              </Panel>
            </div>
          </Section>
        )}

        {state.activeSurface === "a2a" && (
          <Section title="A2A Contract Testing" eyebrow="Agent cards, lifecycle, capability negotiation">
            <div className="two-column">
              <Panel title="Agent card inspector">
                <CodeBlock value={JSON.stringify({ name: "Support Triage Agent", url: "https://support.example.com/a2a", capabilities: ["tickets", "refunds"], auth: "bearer" }, null, 2)} />
              </Panel>
              <Panel title="Test runner">
                <ResultList />
                <button className="primary-button" onClick={() => runOperation("a2a test running")}>
                  <Play aria-hidden="true" size={16} />
                  Run contract tests
                </button>
              </Panel>
            </div>
          </Section>
        )}

        {state.activeSurface === "observe" && (
          <Section title="Observe" eyebrow="OTLP, Phoenix, OpenAI event traces">
            <div className="two-column">
              <Panel title="Import and live receiver">
                <div className="empty-state">
                  <Eye aria-hidden="true" size={28} />
                  <strong>{state.edition === "browser" ? "OTLP receiver toggled off" : "Drop OTLP JSON, proto, Phoenix JSON, or OpenAI event traces"}</strong>
                  <span>{state.edition === "browser" ? "Use file import in browser edition." : "Local HTTP listens on :4318 and gRPC on :4317."}</span>
                </div>
                <div className="button-row">
                  <button className="secondary-button">Import file</button>
                  <button className="primary-button" disabled={state.edition === "browser"} onClick={() => runOperation("otlp ingesting")}>
                    Start receiver
                  </button>
                  <button className="secondary-button" onClick={() => setError("OTLP malformed: content-type does not match JSON or protobuf trace payload.")}>
                    Malformed sample
                  </button>
                </div>
              </Panel>
              <Panel title="Span timeline">
                <SpanTimeline />
                <button className="secondary-button" onClick={() => runOperation("converting to regression", "replay")}>
                  Convert failed span to regression
                </button>
              </Panel>
            </div>
          </Section>
        )}

        {state.activeSurface === "compare" && (
          <Section title="Compare" eyebrow="Model upgrade regression matrix">
            <div className="compare-layout">
              <Panel title="Model picker">
                {models.map((model) => (
                  <label className="toggle-row" key={model}>
                    <input type="checkbox" checked={state.selectedModels.includes(model)} onChange={() => toggleModel(model)} />
                    {model}
                  </label>
                ))}
                {state.selectedModels.length < 2 && <Notice>Comparison needs at least two models selected.</Notice>}
              </Panel>
              <Panel title="Matrix view">
                <CompareMatrix selectedModels={state.selectedModels} />
              </Panel>
            </div>
          </Section>
        )}

        {state.activeSurface === "ship" && (
          <Section title="Ship" eyebrow="Export regression artifacts">
            <Notice>Ship: no suite selected falls back to the current trace until a regression bank is selected.</Notice>
            <div className="ship-grid">
              <ExportCard title="GitHub Action" value={exportBundle.workflow} />
              <ExportCard title="JUnit" value={exportBundle.junit} />
              <ExportCard title="PR comment" value={exportBundle.prComment} />
              <ExportCard title="AuraOne intake" value={exportBundle.intakeManifest} />
              <Panel title="Trace card export modal">
                <button className="primary-button" onClick={() => setTraceCardModalOpen(true)}>
                  <FileJson aria-hidden="true" size={16} />
                  Open trace card export
                </button>
              </Panel>
            </div>
          </Section>
        )}

        {state.activeSurface === "settings" && (
          <Section title="Settings" eyebrow="Models, Privacy, Sandbox, Updates, Telemetry, About">
            <div className="settings-grid">
              <Panel title="Models">
                {models.map((model) => (
                  <label className="toggle-row" key={model}>
                    <input type="checkbox" defaultChecked={model !== "llama-4-local"} />
                    {model}
                  </label>
                ))}
                <Field label="Ollama endpoint" value="http://localhost:11434" onChange={() => undefined} />
                <button className="secondary-button" onClick={() => setError("Model API failed: provider returned 401 invalid_api_key. Raw provider error is available in details.")}>
                  Simulate provider error
                </button>
              </Panel>
              <Panel title="Privacy and secrets">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={telemetryOptIn}
                    onChange={(event) => handleTelemetryOptInChange(event.target.checked)}
                  />
                  Telemetry opt-in
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={crashReportsOptIn}
                    onChange={(event) => setCrashReportsOptIn(event.target.checked)}
                  />
                  Crash reports opt-in
                </label>
                <StatusPill tone={crashReportsOptIn ? "warning" : "success"} label={`Crash reports ${crashReportsOptIn ? "opted in" : "off"}`} />
                <label className="toggle-row">
                  <input type="checkbox" defaultChecked />
                  Redact trace preview before intake export
                </label>
                <Notice>Provider API keys are stored in the OS keychain on desktop and passphrase-protected browser storage in the web edition.</Notice>
              </Panel>
              <Panel title="Telemetry event log">
                <pre aria-label="Telemetry event log" className="code-block">
                  {JSON.stringify(telemetryEntries, null, 2)}
                </pre>
              </Panel>
              <Panel title="Sandbox and updates">
                <label className="toggle-row">
                  <input type="checkbox" defaultChecked />
                  Sandbox stdio servers
                </label>
                <label className="toggle-row">
                  <input type="checkbox" defaultChecked />
                  Verify signed update manifests
                </label>
                <StatusPill tone="success" label="MIT licensed" />
                <button className="secondary-button" onClick={() => setError("Disk full / SQLite write failed: trace store could not append turn 12.")}>
                  Simulate disk full
                </button>
              </Panel>
              <Panel title="Empty and error states">
                <StateGallery />
              </Panel>
            </div>
          </Section>
        )}
      </main>

      {state.commandPaletteOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="command-palette">
            <div className="command-input">
              <Command aria-hidden="true" size={18} />
              <input autoFocus aria-label="Search commands" placeholder="Search commands" />
            </div>
            {surfaceCommands.map((command) => (
              <button
                key={command.id}
                onClick={() => setState((current) => ({ ...current, activeSurface: command.surface, commandPaletteOpen: false }))}
              >
                <span>{command.title}</span>
                <kbd>{command.key}</kbd>
              </button>
            ))}
          </div>
        </div>
      )}

      {state.firstRunOpen && (
        <div className="first-run" role="dialog" aria-modal="true" aria-label="First-run wizard">
          <div>
            <strong>First-run setup</strong>
            <ol>
              <li>Choose desktop or browser edition.</li>
              <li>Set provider-key storage.</li>
              <li>Confirm telemetry and crash reports stay off by default.</li>
              <li>Pick a sample MCP server or connect your own.</li>
              <li>Run the first replay and export a regression suite.</li>
            </ol>
          </div>
          <button className="primary-button" onClick={() => setState((current) => ({ ...current, firstRunOpen: false }))}>
            Start
          </button>
        </div>
      )}

      {traceCardModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Trace card export modal">
          <div className="export-modal">
            <div className="modal-heading">
              <div>
                <span>Trace card export</span>
                <strong>{selectedTrace.name}</strong>
              </div>
              <button className="icon-button" aria-label="Close trace card export" onClick={() => setTraceCardModalOpen(false)}>
                <XCircle aria-hidden="true" size={18} />
              </button>
            </div>
            <TraceSummary traceId={selectedTrace.id} />
            <CodeBlock value={exportBundle.traceCard} />
            <div className="button-row">
              <button className="primary-button">
                <Download aria-hidden="true" size={16} />
                Export trace card
              </button>
              <button className="secondary-button" onClick={() => setTraceCardModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <section className="surface">
      <div className="surface-heading">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {children}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ManifestInspector() {
  return (
    <div className="manifest-tabs">
      <div className="stats-row">
        <Stat label="Tools" value={String(sampleManifest.tools.length)} />
        <Stat label="Resources" value={String(sampleManifest.resources.length)} />
        <Stat label="Prompts" value={String(sampleManifest.prompts.length)} />
      </div>
      <h3>Tools</h3>
      {sampleManifest.tools.map((tool) => (
        <article className="manifest-item" key={tool.name}>
          <div>
            <strong>{tool.title}</strong>
            <span>{tool.description}</span>
          </div>
          <RiskBadges findings={tool.risk} />
        </article>
      ))}
      <h3>Resources</h3>
      {sampleManifest.resources.map((resource) => (
        <article className="manifest-item" key={resource.uri}>
          <div>
            <strong>{resource.name}</strong>
            <span>{resource.uri}</span>
          </div>
          <code>{resource.mimeType}</code>
        </article>
      ))}
      <h3>Prompts</h3>
      {sampleManifest.prompts.map((prompt) => (
        <article className="manifest-item" key={prompt.name}>
          <div>
            <strong>{prompt.name}</strong>
            <span>{prompt.description}</span>
          </div>
        </article>
      ))}
      <CodeBlock value={JSON.stringify(sampleManifest, null, 2)} />
    </div>
  );
}

function SchemaForm({ schema }: { schema: Record<string, unknown> }) {
  const properties = (schema.properties ?? {}) as Record<string, { type?: string; enum?: string[] }>;
  return (
    <div className="schema-form">
      <strong>Form view</strong>
      {Object.entries(properties).map(([key, value]) => (
        <label className="field compact" key={key}>
          <span>
            {key} <code>{value.type}</code>
          </span>
          {value.enum ? <select>{value.enum.map((item) => <option key={item}>{item}</option>)}</select> : <input />}
        </label>
      ))}
    </div>
  );
}

function TraceBrowser(props: {
  search: string;
  setSearch: (search: string) => void;
  selectedTraceId: string;
  onSelect: (traceId: string) => void;
  sessions: typeof traceSessions;
}) {
  return (
    <div className="trace-grid">
      <Panel title="Sessions">
        <label className="field">
          <span>Search</span>
          <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="refund, retry, safety" />
        </label>
        {props.sessions.length === 0 && <EmptyState icon={Search} title="No sessions yet" body="Record an MCP run or import an OTLP trace to populate this list." />}
        <Virtuoso
          className="trace-list"
          data={props.sessions}
          itemContent={(_, session) => {
            const summary = summarizeSession(session);
            return (
              <button
                className={props.selectedTraceId === session.id ? "trace-card active" : "trace-card"}
                onClick={() => props.onSelect(session.id)}
              >
                <div>
                  <strong>{session.name}</strong>
                  <span>{session.model}</span>
                </div>
                <StatusPill tone={session.status === "passed" ? "success" : session.status === "failed" ? "danger" : "warning"} label={session.status} />
                <small>{summary.toolCalls} calls · {summary.latencyMs} ms · ${summary.costUsd.toFixed(4)}</small>
              </button>
            );
          }}
        />
      </Panel>
      <Panel title="Session detail">
        <Timeline events={(props.sessions.find((session) => session.id === props.selectedTraceId) ?? traceSessions[0]).events} />
      </Panel>
    </div>
  );
}

function LogPanel() {
  const logs = [
    "12:04:10 spawn python -m support_crm_mcp",
    "12:04:11 initialize request sent",
    "12:04:11 capabilities received: tools, resources, prompts",
    "12:04:12 health check passed",
  ];

  return (
    <div className="log-panel" role="log" aria-label="Server logs panel">
      <div>
        <strong>Server logs panel</strong>
        <span>Stdio lifecycle and protocol events</span>
      </div>
      <CodeBlock value={logs.join("\n")} />
    </div>
  );
}

function StateGallery() {
  const states = [
    "No connections yet",
    "No tools on the server",
    "No resources",
    "No prompts",
    "No A2A agent card loaded",
    "No traces in Observe",
    "No test suites",
    "Ship: no suite selected",
  ];

  return (
    <div className="state-gallery">
      {states.map((state) => (
        <EmptyState key={state} icon={AlertTriangle} title={state} body="The workspace keeps actions disabled until this prerequisite is available." />
      ))}
    </div>
  );
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length > 100) {
    return (
      <Virtuoso
        className="timeline-virtualized"
        data={events}
        data-testid="timeline-virtualized"
        itemContent={(_, event) => <TimelineRow event={event} />}
      />
    );
  }

  return (
    <ol className="timeline">
      {events.map((event) => <TimelineRow as="li" event={event} key={event.id} />)}
    </ol>
  );
}

function TimelineRow({ as: Component = "div", event }: { as?: "div" | "li"; event: TimelineEvent }) {
  return (
    <Component className="timeline-row">
      <span className={`timeline-dot ${event.kind}`} aria-hidden="true" />
      <div>
        <strong>{event.title}</strong>
        <p>{event.body}</p>
        <small>
          {event.timestamp}
          {event.latencyMs ? ` · ${event.latencyMs} ms` : ""}
          {event.costUsd ? ` · $${event.costUsd.toFixed(4)}` : ""}
        </small>
      </div>
    </Component>
  );
}

function DiffView() {
  const rows = ["lookup_order", "refund_order", "final_response"];
  return (
    <div className="diff-table">
      <div className="diff-head">Turn</div>
      <div className="diff-head">Baseline</div>
      <div className="diff-head">Candidate</div>
      {rows.map((row, index) => (
        <Fragment key={row}>
          <div key={`${row}-turn`}>{row}</div>
          <div key={`${row}-base`} className="diff-pass">
            {index === 1 ? "1 retry" : "matched"}
          </div>
          <div key={`${row}-cand`} className={index === 1 ? "diff-warn" : "diff-pass"}>
            {index === 1 ? "2 retries, +310 ms" : "matched"}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function ResultList() {
  return (
    <div className="result-list">
      {a2aResults.map((result) => (
        <article key={result.id}>
          {result.status === "pass" ? <CheckCircle2 aria-hidden="true" size={18} /> : <XCircle aria-hidden="true" size={18} />}
          <div>
            <strong>{result.name}</strong>
            <span>{result.detail}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function SpanTimeline() {
  return (
    <div className="span-timeline">
      {spans.map((span) => (
        <article key={span.id} style={{ marginLeft: `${span.startMs / 18}px`, width: `${Math.max(span.durationMs / 8, 72)}px` }}>
          <strong>{span.name}</strong>
          <span>{span.durationMs} ms</span>
        </article>
      ))}
    </div>
  );
}

function CompareMatrix({ selectedModels }: { selectedModels: string[] }) {
  return (
    <div className="matrix" style={{ gridTemplateColumns: `minmax(120px, 1fr) repeat(${Math.max(selectedModels.length, 1)}, minmax(130px, 1fr))` }}>
      <strong>Turn</strong>
      {selectedModels.map((model) => (
        <strong key={model}>{model}</strong>
      ))}
      {["Plan", "lookup_order", "refund_order", "Final"].map((turn, index) => (
        <Fragment key={turn}>
          <span key={`${turn}-label`}>{turn}</span>
          {selectedModels.map((model) => (
            <span key={`${turn}-${model}`} className={index === 2 && model.includes("gpt") ? "matrix-warn" : "matrix-ok"}>
              {index === 2 && model.includes("gpt") ? "extra retry" : "matched"}
            </span>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function ExportCard({ title, value }: { title: string; value: string }) {
  return (
    <Panel title={title}>
      <CodeBlock value={value} />
      <button className="secondary-button">
        <Download aria-hidden="true" size={16} />
        Export
      </button>
    </Panel>
  );
}

function TraceSummary({ traceId }: { traceId: string }) {
  const trace = traceSessions.find((session) => session.id === traceId) ?? traceSessions[0];
  const summary = summarizeSession(trace);
  return (
    <div className="stats-row">
      <Stat label="Trace" value={trace.name} />
      <Stat label="Tool calls" value={String(summary.toolCalls)} />
      <Stat label="Latency" value={`${summary.latencyMs} ms`} />
      <Stat label="Cost" value={`$${summary.costUsd.toFixed(4)}`} />
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  return <span className={`status ${tone}`}>{label}</span>;
}

function RiskBadges({ findings }: { findings: Array<{ severity: "pass" | "warn" | "fail"; message: string }> }) {
  return (
    <span className="risk-badges">
      {findings.map((finding) => (
        <span className={`risk ${finding.severity}`} key={finding.message} title={finding.message}>
          {finding.severity}
        </span>
      ))}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}

function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="empty-state">
      <Icon aria-hidden="true" size={28} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="code-block" tabIndex={0} aria-label="Code sample">
      {value}
    </pre>
  );
}

function OperationBanner({ label }: { label: string }) {
  return (
    <div className="operation-banner" role="status">
      <RefreshCw aria-hidden="true" size={16} />
      {label}
    </div>
  );
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>
        <AlertTriangle aria-hidden="true" size={16} />
        {message}
      </span>
      <span className="error-actions">
        <button className="secondary-button" onClick={() => void navigator.clipboard?.writeText(message)}>
          Copy details
        </button>
        <button className="secondary-button" onClick={onClose}>
          Dismiss
        </button>
      </span>
    </div>
  );
}
