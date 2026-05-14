import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Editor } from "@monaco-editor/react";
import { Virtuoso } from "react-virtuoso";
import {
  TelemetryEventLog,
  type TelemetryLogEntry,
  createTelemetryEvent,
  toAuraTelemetryEvents,
  type AuraTelemetryEvent,
} from "./platformTelemetry";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronsRight,
  CircleDashed,
  Command,
  Copy,
  Cpu,
  Download,
  Eye,
  FileJson,
  GitCompare,
  Github,
  KeyRound,
  Play,
  Plug,
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
  filterSessions,
  modelPresets,
  models,
  sampleManifest,
  sampleTelemetryEvents,
  sampleToolPayload,
  spans,
  summarizeSession,
  surfaces,
  traceSessions,
  validateJson,
  vendorLabels,
} from "./data";
import { useStudioStore } from "./store";
import type {
  A2ATestResult,
  ConnectionDraft,
  ExportBundle,
  ModelPreset,
  ModelVendor,
  Manifest,
  ProviderKeyStatus,
  Span,
  Surface,
  TimelineEvent,
  TraceSession,
} from "./types";
import {
  deleteProviderKeySecret,
  listProviderKeySecrets,
  loadProviderKeySecret,
  providerSecretMode,
  saveProviderKeySecret,
  validateByoProviderKey,
} from "./platformBridge";
import { ensureAgentIntakeInstallSigningKeypair } from "./platformIntake";
import {
  runtimeA2ARunContracts,
  runtimeCompareRun,
  runtimeExportBundle,
  runtimeMcpConnect,
  runtimeOtlpReceiverToggle,
  runtimeReplayRun,
  runtimeSidecarHealth,
  runtimeTraceImport,
  runtimeTraceSearch,
  runtimeUnavailableMessage,
} from "./runtimeBridge";

const initialConnection: ConnectionDraft = {
  name: "support-crm-mcp",
  transport: "stdio",
  command: "python",
  args: "-m support_crm_mcp",
  cwd: "~/agent-projects/support-crm",
  url: "https://support.example.com/mcp",
  headers: '{"Authorization":"Bearer ${MCP_TOKEN}"}',
};
const demoConnection: ConnectionDraft = {
  name: "public-docs-search-demo",
  transport: "http",
  command: "",
  args: "",
  cwd: "",
  url: "https://agent-studio-open.vercel.app/demo/mcp/docs-search",
  headers: "{}",
};
const demoMode = import.meta.env.VITE_AGENT_STUDIO_DEMO_MODE === "true";
const demoBrowserUrl =
  import.meta.env.VITE_AGENT_STUDIO_BROWSER_URL ??
  "https://agentstudio.auraone.ai";
const docsUrl = "https://auraone.ai/resources/docs/agent-studio-open";
const repoUrl = "https://github.com/auraoneai/agent-studio-open";

const emptyManifest: Manifest = {
  serverName: "No MCP server connected",
  version: "runtime",
  tools: [],
  resources: [],
  prompts: [],
};

const emptyTrace: TraceSession = {
  id: "trace-empty",
  name: "No trace selected",
  model: "runtime",
  status: "warning",
  createdAt: new Date(0).toISOString(),
  tags: [],
  events: [],
};

const surfaceIcons: Record<Surface, LucideIcon> = {
  connect: Plug,
  compose: Send,
  traces: FileJson,
  replay: RefreshCw,
  a2a: Workflow,
  observe: Activity,
  compare: GitCompare,
  ship: Download,
  settings: Settings,
};

const surfaceGroups: Array<{
  id: "work" | "observe" | "release";
  label: string;
}> = [
  { id: "work", label: "Work" },
  { id: "observe", label: "Observability" },
  { id: "release", label: "Release" },
];

const vendorTone: Record<ModelVendor, string> = {
  anthropic: "vendor-anthropic",
  openai: "vendor-openai",
  google: "vendor-google",
  local: "vendor-local",
  custom: "vendor-custom",
};

const surfaceCommands: Array<{
  id: string;
  title: string;
  surface: Surface;
  key: string;
}> = [
  {
    id: "connect",
    title: "Open connection panel",
    surface: "connect",
    key: "Cmd/Ctrl+1",
  },
  {
    id: "compose",
    title: "New compose request",
    surface: "compose",
    key: "Cmd/Ctrl+N",
  },
  {
    id: "traces",
    title: "Open trace browser",
    surface: "traces",
    key: "Cmd/Ctrl+3",
  },
  {
    id: "replay",
    title: "Replay selected trace",
    surface: "replay",
    key: "Cmd/Ctrl+R",
  },
  {
    id: "compare",
    title: "Compare model behavior",
    surface: "compare",
    key: "Cmd/Ctrl+D",
  },
  {
    id: "ship",
    title: "Export GitHub Action",
    surface: "ship",
    key: "Cmd/Ctrl+Shift+E",
  },
  {
    id: "settings",
    title: "Open settings",
    surface: "settings",
    key: "Cmd/Ctrl+,",
  },
];

function StudioMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="studio-mark studio-mark-frame"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img className="studio-mark-image" src="/icon-192.png" alt="" />
    </span>
  );
}

function HealthBeacon({
  tone = "cyan",
}: {
  tone?: "cyan" | "amber" | "violet";
}) {
  return (
    <span className={`health-beacon health-beacon-${tone}`} aria-hidden="true">
      <span />
    </span>
  );
}

function AuraTelemetryEventLog({ events }: { events: AuraTelemetryEvent[] }) {
  if (!events.length) {
    return (
      <span className="muted-inline">
        No local telemetry events recorded yet.
      </span>
    );
  }
  return (
    <ul className="event-log" aria-label="Platform telemetry event log">
      {events.map((event) => (
        <li key={event.id}>
          <code>{new Date(event.timestamp).toLocaleTimeString()}</code>
          <strong>{event.name}</strong>
          <span>
            {event.destination}: {event.payloadPreview.validation}
          </span>
          <StatusPill
            tone={event.optedIn ? "success" : "neutral"}
            label={event.optedIn ? "sent" : "local"}
          />
        </li>
      ))}
    </ul>
  );
}

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
  const [connection, setConnection] = useState<ConnectionDraft>(() =>
    demoMode ? demoConnection : initialConnection,
  );
  const [jsonValue, setJsonValue] = useState(
    demoMode ? sampleToolPayload : "{\n  \n}",
  );
  const [sequence, setSequence] = useState<string[]>(
    demoMode ? ["lookup_order", "refund_order"] : [],
  );
  const [lastResponse, setLastResponse] = useState(
    "No response yet. Send a tool call or run an agent loop.",
  );
  const [streamingResponse, setStreamingResponse] = useState(
    "No streaming response yet.",
  );
  const [runtimeLogs, setRuntimeLogs] = useState<string[]>(
    demoMode
      ? [
          "demo mode active",
          "public sample manifest loaded",
          "local process and trace storage disabled",
        ]
      : [],
  );
  const [manifest, setManifest] = useState<Manifest>(
    demoMode ? sampleManifest : emptyManifest,
  );
  const [runtimeTraceSessions, setRuntimeTraceSessions] = useState<
    TraceSession[]
  >(demoMode ? traceSessions : []);
  const [runtimeA2AResults, setRuntimeA2AResults] = useState<A2ATestResult[]>(
    demoMode ? a2aResults : [],
  );
  const [runtimeSpans, setRuntimeSpans] = useState<Span[]>(
    demoMode ? spans : [],
  );
  const [traceImportPath, setTraceImportPath] = useState("");
  const [traceImportFormat, setTraceImportFormat] = useState("openai");
  const [traceStorePath, setTraceStorePath] = useState("agentstudio-live.ast");
  const [replayPath, setReplayPath] = useState("");
  const [assertionsPath, setAssertionsPath] = useState("");
  const [replayResult, setReplayResult] = useState<unknown>(null);
  const [compareBaseline, setCompareBaseline] = useState("");
  const [compareCandidate, setCompareCandidate] = useState("");
  const [compareResult, setCompareResult] = useState<unknown>(null);
  const [exportInput, setExportInput] = useState("agentstudio-live.ast");
  const [exportOut, setExportOut] = useState("agentstudio-export.md");
  const [traceCardModalOpen, setTraceCardModalOpen] = useState(false);
  const [telemetryOptIn, setTelemetryOptIn] = useState(false);
  const [crashReportsOptIn, setCrashReportsOptIn] = useState(false);
  const [telemetryLog] = useState(() => new TelemetryEventLog());
  const [telemetryEntries, setTelemetryEntries] = useState<
    readonly TelemetryLogEntry[]
  >([]);
  const [installKeyStatus, setInstallKeyStatus] = useState("not checked");
  const [sessionId] = useState(() => createUuid());
  const [installId] = useState(() => createUuid());
  const exportBundle = useMemo<ExportBundle>(
    () => buildExportBundle(runtimeTraceSessions),
    [runtimeTraceSessions],
  );
  const [keyInput, setKeyInput] = useState("");
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [keyVendor, setKeyVendor] = useState<ModelVendor>("openai");
  const [providerKeyStatus, setProviderKeyStatus] = useState<{
    tone: "success" | "warning" | "danger" | "neutral";
    label: string;
  } | null>(null);
  const [savedProviderKeys, setSavedProviderKeys] = useState<
    Array<{ provider: string; updatedAt: string }>
  >([]);

  const selectedTrace =
    runtimeTraceSessions.find(
      (session) => session.id === state.selectedTraceId,
    ) ??
    runtimeTraceSessions[0] ??
    emptyTrace;
  const selectedTool =
    manifest.tools.find((tool) => tool.name === state.selectedToolName) ??
    manifest.tools[0] ??
    null;
  const filteredSessions = useMemo(
    () => filterSessions(runtimeTraceSessions, state.search),
    [runtimeTraceSessions, state.search],
  );
  const jsonValidation = useMemo(() => validateJson(jsonValue), [jsonValue]);
  const auraTheme = state.theme === "contrast" ? "high-contrast" : state.theme;
  const customModelInList =
    state.customModelId.trim().length > 0 &&
    state.selectedModels.includes(state.customModelId.trim());
  const secretMode = providerSecretMode();

  useEffect(() => {
    document.documentElement.dataset.theme = auraTheme;
    document.documentElement.dataset.edition = state.edition;
    document.documentElement.dataset.demo = demoMode ? "true" : "false";
  }, [auraTheme, state.edition]);

  const refreshSavedProviderKeys = async () => {
    try {
      const records = await listProviderKeySecrets();
      setSavedProviderKeys(records);
      setState((current) => {
        let providerKeys = current.providerKeys;
        for (const record of records) {
          if (!(record.provider in providerKeys)) {
            continue;
          }
          const vendor = record.provider as ModelVendor;
          providerKeys = {
            ...providerKeys,
            [vendor]: {
              ...providerKeys[vendor],
              status:
                providerKeys[vendor].status === "verified"
                  ? "verified"
                  : "saved",
              hint:
                secretMode === "os-keychain"
                  ? "OS keychain"
                  : "encrypted local key",
              lastVerifiedAt: providerKeys[vendor].lastVerifiedAt,
            },
          };
        }
        return providerKeys === current.providerKeys
          ? current
          : { ...current, providerKeys };
      });
    } catch (error) {
      setProviderKeyStatus({
        tone: "danger",
        label:
          error instanceof Error
            ? error.message
            : "Provider key store is unavailable.",
      });
    }
  };

  useEffect(() => {
    void refreshSavedProviderKeys();
  }, []);

  useEffect(() => {
    if (demoMode) {
      return;
    }
    void runtimeSidecarHealth()
      .then((health) => {
        setInstallKeyStatus(
          health.ok ? "CLI runtime ready" : "CLI runtime missing packages",
        );
      })
      .catch((error) => {
        setInstallKeyStatus(
          error instanceof Error ? error.message : "CLI runtime unavailable",
        );
      });
  }, []);

  useEffect(() => {
    if (!demoMode) {
      return;
    }
    setState((current) => {
      if (
        current.edition === "browser" &&
        !current.firstRunOpen &&
        !current.recording
      ) {
        return current;
      }
      return {
        ...current,
        edition: "browser",
        firstRunOpen: false,
        recording: false,
      };
    });
  }, [setState]);

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
        if (!demoMode) {
          setState((current) => ({
            ...current,
            recording: !current.recording,
          }));
        }
      }
      if (mod && event.key.toLowerCase() === "r" && !event.shiftKey) {
        event.preventDefault();
        setState((current) => ({
          ...current,
          activeSurface: "replay",
          loadingOperation: "replaying",
        }));
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
    setState((current) => ({
      ...current,
      loadingOperation,
      activeSurface: nextSurface ?? current.activeSurface,
    }));
    window.setTimeout(
      () => setState((current) => ({ ...current, loadingOperation: null })),
      450,
    );
  };

  const recordTelemetrySurface = (
    surface: "mcp" | "otlp" | "a2a" | "llm_gateway" | "intake",
  ) => {
    telemetryLog.record(
      createTelemetryEvent({
        eventName: "agent_protocol_surface_used",
        eventId: createUuid(),
        timestamp: new Date().toISOString(),
        sessionId,
        app: {
          flagship: "agent-studio-open",
          version: "0.1.0",
          channel: "beta",
        },
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

  const setError = (message: string) => {
    setState((current) => ({ ...current, errorMessage: message }));
  };

  const showCliOnlyFeature = (feature: string, command: string) => {
    setError(
      `${feature} is available in the CLI engine, but the desktop UI binding is not implemented in this build. Use: ${command}`,
    );
  };

  const runConnect = async () => {
    if (state.edition === "browser" && connection.transport === "stdio") {
      setState((current) => ({
        ...current,
        errorMessage:
          "Browser edition cannot use stdio. Choose SSE, HTTP, or WebSocket.",
      }));
      return;
    }
    recordTelemetrySurface("mcp");
    if (demoMode) {
      runOperation("loading curated demo server");
      return;
    }
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "connecting",
        errorMessage: null,
      }));
      const runtimeManifest = await runtimeMcpConnect(connection);
      setManifest(runtimeManifest);
      setRuntimeLogs([
        `${new Date().toLocaleTimeString()} connected via ${connection.transport}`,
        `${runtimeManifest.tools.length} tools, ${runtimeManifest.resources.length} resources, ${runtimeManifest.prompts.length} prompts discovered`,
      ]);
      setState((current) => ({
        ...current,
        loadingOperation: null,
        selectedToolName:
          runtimeManifest.tools[0]?.name ?? current.selectedToolName,
      }));
      setLastResponse("Connected. Select a tool from the live MCP manifest.");
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(
        error instanceof Error ? error.message : "MCP connection failed.",
      );
    }
  };

  const runToolCall = () => {
    if (!selectedTool) {
      setError("Connect to an MCP server before sending a tool call.");
      return;
    }
    if (!jsonValidation.ok) {
      setError(`Tool call failed: ${jsonValidation.message}`);
      return;
    }
    setLastResponse(
      JSON.stringify(
        {
          ok: false,
          tool: selectedTool.name,
          trace_id: "trace-not-recorded",
          recorded: state.recording,
          error:
            "Live tool invocation is not exposed by the current CLI runtime. MCP discovery is live; tool execution requires the next runtime command.",
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
    setStreamingResponse(
      "Model streaming is available through the CLI runtime: agentstudio model --provider <provider> --model <model> --prompt <prompt> --stream",
    );
    setError(
      "Model streaming is not connected to provider credentials in the desktop UI yet. Use the CLI model command.",
    );
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

  const addCustomModel = () => {
    const id = state.customModelId.trim();
    if (!id) {
      return;
    }
    setState((current) => ({
      ...current,
      selectedModels: current.selectedModels.includes(id)
        ? current.selectedModels
        : [...current.selectedModels, id],
    }));
  };

  const agentCard = useMemo(
    () => ({
      name: "Support Triage Agent",
      url: "https://support.example.com/a2a",
      capabilities: ["tickets", "refunds"],
      auth: "bearer",
    }),
    [],
  );

  const runA2AContracts = async () => {
    if (demoMode) {
      setRuntimeA2AResults(a2aResults);
      runOperation("a2a demo result loaded");
      return;
    }
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "running A2A contracts",
        errorMessage: null,
      }));
      const results = await runtimeA2ARunContracts(agentCard);
      setRuntimeA2AResults(results);
      setState((current) => ({ ...current, loadingOperation: null }));
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(
        error instanceof Error
          ? error.message
          : runtimeUnavailableMessage("A2A contract tests"),
      );
    }
  };

  const toggleOtlpReceiver = async () => {
    if (state.edition === "browser") {
      setError(runtimeUnavailableMessage("OTLP receiver"));
      return;
    }
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "starting OTLP receiver",
        errorMessage: null,
      }));
      const result = await runtimeOtlpReceiverToggle(
        true,
        "agentstudio-live.ast",
      );
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(
        result.running
          ? "OTLP receiver is running on 127.0.0.1:4318 and writing agentstudio-live.ast."
          : "OTLP receiver stopped.",
      );
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(
        error instanceof Error ? error.message : "OTLP receiver failed.",
      );
    }
  };

  const importTraceFile = async () => {
    if (!traceImportPath.trim()) {
      setError("Choose a trace file path before importing.");
      return;
    }
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "importing trace",
        errorMessage: null,
      }));
      const result = await runtimeTraceImport(
        traceImportPath.trim(),
        traceImportFormat.trim(),
        traceStorePath.trim(),
      );
      const sessionId =
        typeof result.session_id === "string"
          ? result.session_id
          : createUuid();
      const imported: TraceSession = {
        id: sessionId,
        name: `Imported ${traceImportFormat}`,
        model: "runtime",
        status: "passed",
        createdAt: new Date().toISOString(),
        tags: ["imported", traceImportFormat],
        events: [
          {
            id: `${sessionId}-import`,
            kind: "replay",
            title: "Trace imported",
            body: `${traceImportPath} -> ${traceStorePath}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ],
      };
      setRuntimeTraceSessions((current) => [
        imported,
        ...current.filter((session) => session.id !== imported.id),
      ]);
      setState((current) => ({
        ...current,
        loadingOperation: null,
        selectedTraceId: imported.id,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(error instanceof Error ? error.message : "Trace import failed.");
    }
  };

  const searchTraceStore = async () => {
    const query = state.search.trim();
    if (!query) {
      setError("Enter a trace search query before searching the store.");
      return;
    }
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "searching trace store",
        errorMessage: null,
      }));
      const hits = await runtimeTraceSearch(traceStorePath.trim(), query);
      setState((current) => ({ ...current, loadingOperation: null }));
      setLastResponse(JSON.stringify(hits, null, 2));
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(error instanceof Error ? error.message : "Trace search failed.");
    }
  };

  const runReplay = async () => {
    if (!replayPath.trim() || !assertionsPath.trim()) {
      setError(
        "Replay requires a replay JSON path and an assertions file path.",
      );
      return;
    }
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "running replay",
        errorMessage: null,
      }));
      const result = await runtimeReplayRun(
        replayPath.trim(),
        assertionsPath.trim(),
      );
      setReplayResult(result);
      setState((current) => ({ ...current, loadingOperation: null }));
      setLastResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(error instanceof Error ? error.message : "Replay failed.");
    }
  };

  const runCompare = async () => {
    if (!compareBaseline.trim() || !compareCandidate.trim()) {
      setError("Compare requires baseline and candidate .ast store paths.");
      return;
    }
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "running compare",
        errorMessage: null,
      }));
      const result = await runtimeCompareRun(
        compareBaseline.trim(),
        compareCandidate.trim(),
      );
      setCompareResult(result);
      setState((current) => ({ ...current, loadingOperation: null }));
      setLastResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(error instanceof Error ? error.message : "Compare failed.");
    }
  };

  const exportTraceCard = async () => {
    if (!exportInput.trim() || !exportOut.trim()) {
      setError("Export requires an input path and output path.");
      return;
    }
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "exporting trace card",
        errorMessage: null,
      }));
      const result = await runtimeExportBundle(
        "trace-card",
        exportInput.trim(),
        exportOut.trim(),
      );
      setState((current) => ({ ...current, loadingOperation: null }));
      setLastResponse(JSON.stringify(result, null, 2));
      setTraceCardModalOpen(false);
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(error instanceof Error ? error.message : "Export failed.");
    }
  };

  const updateProviderKey = (
    vendor: ModelVendor,
    status: ProviderKeyStatus,
    hint?: string,
    lastVerifiedAt?: string | null,
  ) => {
    setState((current) => ({
      ...current,
      providerKeys: {
        ...current.providerKeys,
        [vendor]: {
          ...current.providerKeys[vendor],
          status,
          hint: hint ?? current.providerKeys[vendor].hint,
          lastVerifiedAt:
            lastVerifiedAt === undefined
              ? status === "verified"
                ? "just now"
                : current.providerKeys[vendor].lastVerifiedAt
              : lastVerifiedAt,
        },
      },
    }));
  };

  const saveProviderKey = async () => {
    const validation = validateByoProviderKey(keyVendor, keyInput);
    if (!validation.ok) {
      setProviderKeyStatus({ tone: "danger", label: validation.message });
      return;
    }
    try {
      await saveProviderKeySecret(keyVendor, keyInput.trim(), keyPassphrase);
      updateProviderKey(
        keyVendor,
        "saved",
        secretMode === "os-keychain" ? "OS keychain" : "encrypted local key",
        null,
      );
      setKeyInput("");
      setProviderKeyStatus({
        tone: "success",
        label:
          secretMode === "os-keychain"
            ? `${vendorLabels[keyVendor]} key saved to the OS keychain.`
            : `${vendorLabels[keyVendor]} key saved locally with passphrase encryption.`,
      });
      await refreshSavedProviderKeys();
      runOperation(`saving ${keyVendor} key`);
    } catch (error) {
      setProviderKeyStatus({
        tone: "danger",
        label:
          error instanceof Error
            ? error.message
            : "Provider key could not be saved.",
      });
    }
  };

  const verifyProviderKey = async (vendor: ModelVendor) => {
    try {
      const apiKey = await loadProviderKeySecret(vendor, keyPassphrase);
      const suffix = apiKey.slice(-4).padStart(4, "*");
      updateProviderKey(vendor, "verified", `...${suffix}`, "just now");
      setProviderKeyStatus({
        tone: "success",
        label: `${vendorLabels[vendor]} key verified, ending in ${suffix}.`,
      });
      runOperation(`verifying ${vendor} key`);
    } catch (error) {
      setProviderKeyStatus({
        tone: "danger",
        label:
          error instanceof Error
            ? error.message
            : "Provider key could not be verified.",
      });
    }
  };

  const forgetProviderKey = async (vendor: ModelVendor) => {
    try {
      await deleteProviderKeySecret(vendor);
      updateProviderKey(vendor, "none", "", null);
      setProviderKeyStatus({
        tone: "warning",
        label: `${vendorLabels[vendor]} key removed.`,
      });
      await refreshSavedProviderKeys();
    } catch (error) {
      setProviderKeyStatus({
        tone: "danger",
        label:
          error instanceof Error
            ? error.message
            : "Provider key could not be removed.",
      });
    }
  };

  const handleTelemetryToggle = (value: boolean) => {
    setTelemetryOptIn(value);
    if (!value) {
      telemetryLog.clear();
      setTelemetryEntries([]);
    }
  };

  const handleCrashToggle = (value: boolean) => {
    setCrashReportsOptIn(value);
  };

  const ensureInstallKeypair = async () => {
    const keypair = await ensureAgentIntakeInstallSigningKeypair();
    setInstallKeyStatus(`${keypair.algorithm} key ready`);
  };

  const activeSurfaceMeta =
    surfaces.find((surface) => surface.id === state.activeSurface) ??
    surfaces[0];

  return (
    <div className="studio-shell aura-ide-root" data-theme={auraTheme}>
      <aside className="sidebar" aria-label="Agent Studio Open navigation">
        <div className="brand">
          <StudioMark size={30} />
          <div className="brand-text">
            <strong>Agent Studio</strong>
            <span className="sr-only">Agent Studio Open</span>
            <span>
              {demoMode
                ? "Hosted demo"
                : state.edition === "desktop"
                  ? "Desktop IDE"
                  : "Browser preview"}
            </span>
          </div>
        </div>
        <nav aria-label="Agent Studio navigation">
          {surfaceGroups.map((group) => {
            const groupSurfaces = surfaces.filter(
              (surface) => surface.group === group.id,
            );
            if (!groupSurfaces.length) return null;
            return (
              <div className="nav-group" key={group.id}>
                <span className="nav-group-label">{group.label}</span>
                {groupSurfaces.map((surface) => {
                  const Icon = surfaceIcons[surface.id];
                  const isActive = state.activeSurface === surface.id;
                  return (
                    <button
                      className={isActive ? "nav-item active" : "nav-item"}
                      key={surface.id}
                      onClick={() =>
                        setState((current) => ({
                          ...current,
                          activeSurface: surface.id,
                        }))
                      }
                      aria-current={isActive ? "page" : undefined}
                      aria-label={
                        surface.id === "settings" ? "Open settings" : undefined
                      }
                    >
                      <Icon aria-hidden="true" size={15} />
                      <span>{surface.label}</span>
                      <kbd>{surface.shortcut}</kbd>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button
            className="ghost-button"
            onClick={() =>
              setState((current) => ({ ...current, commandPaletteOpen: true }))
            }
          >
            <Command aria-hidden="true" size={14} />
            <span>Command palette</span>
            <kbd>⌘K</kbd>
          </button>
          <label className="edition-switch">
            <input
              type="checkbox"
              checked={state.edition === "browser"}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  edition: event.target.checked ? "browser" : "desktop",
                }))
              }
            />
            <span>Browser constraints</span>
          </label>
        </div>
      </aside>

      <main className="workbench">
        <header className="topbar">
          <button
            className="palette-button"
            onClick={() =>
              setState((current) => ({ ...current, commandPaletteOpen: true }))
            }
          >
            <Search aria-hidden="true" size={15} />
            <span>Search commands, traces, tools, schemas…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="topbar-actions">
            <div
              className="topbar-state"
              aria-label={
                state.recording ? "State recording" : "State idle local"
              }
            >
              <span className="small-mono">State</span>
              <StatusPill
                tone={state.recording ? "danger" : "neutral"}
                dot
                label={state.recording ? "Recording" : "Idle · Local"}
              />
            </div>
            <span className="topbar-divider" aria-hidden="true" />
            <div className="topbar-health" aria-label="Health nominal">
              <span className="small-mono">Health</span>
              <HealthBeacon tone={state.errorMessage ? "amber" : "cyan"} />
            </div>
            <button
              className="icon-button"
              aria-label="Toggle recording"
              aria-hidden="true"
              aria-pressed={state.recording}
              disabled={demoMode}
              tabIndex={-1}
              onClick={() => {
                if (!demoMode) {
                  setState((current) => ({
                    ...current,
                    recording: !current.recording,
                  }));
                }
              }}
            >
              <Radio aria-hidden="true" size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Open settings"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  activeSurface: "settings",
                }))
              }
            >
              <Settings aria-hidden="true" size={15} />
            </button>
          </div>
        </header>

        <div
          className="context-strip"
          role="status"
          aria-label="Workspace context"
        >
          <ContextChip
            icon={Plug}
            label="Server"
            value={connection.name}
            tone={connection.transport === "stdio" ? "info" : "ok"}
          />
          <ContextChip
            icon={Radio}
            label="Transport"
            value={connection.transport.toUpperCase()}
          />
          <ContextChip
            icon={FileJson}
            label="Trace"
            value={selectedTrace.name}
            truncate
          />
          <ContextChip
            icon={Cpu}
            label="Models"
            value={`${state.selectedModels.length} selected`}
          />
          <span className="context-spacer" />
          <ContextChip
            icon={Shield}
            label="Privacy"
            value={telemetryOptIn ? "Telemetry on" : "Local-only"}
            tone={telemetryOptIn ? "warn" : "ok"}
          />
        </div>

        {state.firstRunOpen && (
          <div
            className="first-run-strip"
            role="dialog"
            aria-label="First-run wizard"
          >
            <div className="first-run-copy">
              <span className="first-run-eyebrow">First-run setup</span>
              <strong>
                <em>Three</em> steps to a working trace.
              </strong>
              <span>
                ① Pick edition · ② Set provider keys · ③ Connect a sample MCP
                server, then run your first replay.
              </span>
            </div>
            <div className="first-run-actions">
              <button
                className="ghost-button"
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    firstRunOpen: false,
                    activeSurface: "settings",
                  }))
                }
              >
                Settings first
              </button>
              <button
                className="primary-button"
                onClick={() =>
                  setState((current) => ({ ...current, firstRunOpen: false }))
                }
              >
                Start
              </button>
              <button
                className="ghost-button compact-square"
                aria-label="Dismiss first-run setup"
                onClick={() =>
                  setState((current) => ({ ...current, firstRunOpen: false }))
                }
              >
                ×
              </button>
            </div>
          </div>
        )}

        {state.loadingOperation && (
          <OperationBanner label={state.loadingOperation} />
        )}
        {state.errorMessage && (
          <ErrorBanner
            message={state.errorMessage}
            onClose={() =>
              setState((current) => ({ ...current, errorMessage: null }))
            }
          />
        )}
        {demoMode && (
          <div className="demo-banner" role="status">
            <div className="demo-banner-copy">
              <StudioMark size={28} />
              <span>
                Public Vercel build. Explore the browser-safe IDE with a
                curated MCP manifest, replay traces, A2A checks, and export
                previews. Local stdio, OS keychain, and OTLP listener are
                desktop-only.
              </span>
            </div>
            <div className="demo-banner-actions">
              <a className="secondary-button" href={docsUrl}>
                <BookOpen aria-hidden="true" size={14} />
                Docs
              </a>
              <a className="secondary-button" href={repoUrl}>
                <Github aria-hidden="true" size={14} />
                GitHub
              </a>
              <a className="primary-button" href={demoBrowserUrl}>
                Browser IDE
              </a>
            </div>
          </div>
        )}

        <div className="surface-wrap">
          {state.activeSurface === "connect" && (
            <Section
              eyebrow="MCP · stdio · sse · http · websocket"
              title={
                <>
                  Connect. <em>Inspect.</em>
                </>
              }
              description="Spin up a local server or attach to a remote endpoint. Manifest, risk findings, and stdio lifecycle are inline. Every byte stays on this machine."
              actions={
                <>
                  <button
                    className="primary-button"
                    onClick={() => void runConnect()}
                  >
                    <Play aria-hidden="true" size={14} />
                    {demoMode ? "Run demo inspection" : "Connect"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      showCliOnlyFeature(
                        "Risk scan",
                        "agentstudio risk-scan <path> --format json",
                      )
                    }
                  >
                    <Shield aria-hidden="true" size={14} />
                    Risk scan
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setError(
                        "Connection failed: server exited before initialize. Retry, edit command, or view logs.",
                      )
                    }
                  >
                    Inspect failure
                  </button>
                </>
              }
            >
              <div className="split-2-3">
                <Panel
                  title="Endpoint"
                  caption={`${activeSurfaceMeta.label} · ${connection.transport.toUpperCase()}`}
                  density="compact"
                >
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Transport"
                  >
                    {(["stdio", "sse", "http", "websocket"] as const).map(
                      (transport) => {
                        const blocked =
                          state.edition === "browser" && transport === "stdio";
                        return (
                          <button
                            key={transport}
                            disabled={blocked}
                            className={
                              connection.transport === transport
                                ? "selected"
                                : ""
                            }
                            aria-pressed={connection.transport === transport}
                            onClick={() =>
                              setConnection((current) => ({
                                ...current,
                                transport,
                              }))
                            }
                          >
                            {transport.toUpperCase()}
                          </button>
                        );
                      },
                    )}
                  </div>
                  <Field
                    label="Name"
                    value={connection.name}
                    onChange={(value) =>
                      setConnection((current) => ({ ...current, name: value }))
                    }
                  />
                  {connection.transport === "stdio" ? (
                    <>
                      <Field
                        label="Command"
                        value={connection.command}
                        onChange={(value) =>
                          setConnection((current) => ({
                            ...current,
                            command: value,
                          }))
                        }
                      />
                      <Field
                        label="Args"
                        value={connection.args}
                        onChange={(value) =>
                          setConnection((current) => ({
                            ...current,
                            args: value,
                          }))
                        }
                      />
                      <Field
                        label="Working directory"
                        value={connection.cwd}
                        onChange={(value) =>
                          setConnection((current) => ({
                            ...current,
                            cwd: value,
                          }))
                        }
                      />
                    </>
                  ) : (
                    <>
                      <Field
                        label="URL"
                        value={connection.url}
                        onChange={(value) =>
                          setConnection((current) => ({
                            ...current,
                            url: value,
                          }))
                        }
                      />
                      <Field
                        label="Headers"
                        value={connection.headers}
                        onChange={(value) =>
                          setConnection((current) => ({
                            ...current,
                            headers: value,
                          }))
                        }
                      />
                    </>
                  )}
                  {state.edition === "browser" && (
                    <Notice tone="info">
                      Browser edition disables stdio and the local OTLP
                      receiver; remote SSE, HTTP, WebSocket, A2A, and IndexedDB
                      storage remain available.
                    </Notice>
                  )}
                  <LogPanel logs={runtimeLogs} />
                </Panel>
                <Panel
                  title="Manifest inspector"
                  caption={`${manifest.serverName} · v${manifest.version}`}
                >
                  <ManifestInspector manifest={manifest} />
                </Panel>
              </div>
            </Section>
          )}

          {state.activeSurface === "compose" && (
            <Section
              eyebrow="Compose · schema-aware tool calls and model loop"
              title={
                <>
                  Send. <em>Replay.</em> Keep the trace.
                </>
              }
              description="Pick a tool, build a payload against its schema, capture the response, and keep the resulting transcript in your local trace store, where every replay starts."
              actions={
                <>
                  <button className="primary-button" onClick={runToolCall}>
                    <Send aria-hidden="true" size={14} />
                    Send
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      showCliOnlyFeature(
                        "Model agent loop",
                        "agentstudio model --provider <provider> --model <model> --prompt <prompt>",
                      )
                    }
                  >
                    <ChevronsRight aria-hidden="true" size={14} />
                    Send with model
                  </button>
                  <button
                    className="secondary-button"
                    onClick={runStreamingModel}
                  >
                    <ChevronsRight aria-hidden="true" size={14} />
                    Stream with model
                  </button>
                </>
              }
            >
              <div className="compose-grid">
                <Panel
                  title="Tools"
                  caption={`${manifest.tools.length} from ${manifest.serverName}`}
                >
                  <div className="tool-list" role="listbox" aria-label="Tools">
                    {manifest.tools.length === 0 && (
                      <EmptyState
                        icon={Plug}
                        title="No live tools loaded"
                        body="Connect to an MCP server to load its runtime manifest."
                      />
                    )}
                    {manifest.tools.map((tool) => (
                      <button
                        key={tool.name}
                        className={
                          state.selectedToolName === tool.name
                            ? "tool active"
                            : "tool"
                        }
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            selectedToolName: tool.name,
                          }))
                        }
                      >
                        <div className="tool-head">
                          <strong>{tool.title}</strong>
                          <code>{tool.name}</code>
                        </div>
                        <p>{tool.description}</p>
                        <RiskBadges findings={tool.risk} />
                      </button>
                    ))}
                  </div>
                  {selectedTool ? (
                    <SchemaForm schema={selectedTool.inputSchema} />
                  ) : null}
                </Panel>
                <Panel
                  title="Payload"
                  caption={jsonValidation.ok ? "JSON valid" : "JSON invalid"}
                >
                  <div className="editor-frame">
                    <Editor
                      height="280px"
                      defaultLanguage="json"
                      theme={state.theme === "light" ? "light" : "vs-dark"}
                      value={jsonValue}
                      onChange={(value) => setJsonValue(value ?? "")}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        tabSize: 2,
                        wordWrap: "on",
                      }}
                    />
                  </div>
                  <StatusPill
                    tone={jsonValidation.ok ? "success" : "danger"}
                    label={
                      jsonValidation.ok ? "Valid JSON" : jsonValidation.message
                    }
                  />
                  <div className="sequence-builder">
                    <div className="sequence-head">
                      <strong>Sequence</strong>
                      <span>
                        {sequence.length} step{sequence.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="sequence-list">
                      {sequence.map((item, index) => (
                        <button
                          key={`${item}-${index}`}
                          onClick={() =>
                            setSequence((current) =>
                              current.filter((_, idx) => idx !== index),
                            )
                          }
                        >
                          <span>{index + 1}</span>
                          <code>{item}</code>
                          <XCircle aria-hidden="true" size={12} />
                        </button>
                      ))}
                      <button
                        className="sequence-add"
                        onClick={() =>
                          selectedTool &&
                          setSequence((current) => [
                            ...current,
                            selectedTool.name,
                          ])
                        }
                        disabled={!selectedTool}
                      >
                        + {selectedTool?.name ?? "tool"}
                      </button>
                    </div>
                  </div>
                </Panel>
                <Panel
                  title="Response"
                  caption={
                    state.recording
                      ? "Recording into trace store"
                      : "Replay buffer"
                  }
                >
                  <Timeline events={selectedTrace.events.slice(0, 4)} compact />
                  <CodeBlock value={lastResponse} label="Tool response" />
                  <CodeBlock
                    value={streamingResponse}
                    label="Streaming buffer"
                    muted
                  />
                </Panel>
              </div>
            </Section>
          )}

          {state.activeSurface === "traces" && (
            <Section
              eyebrow="Trace browser · sessions · filters · full-text search"
              title={
                <>
                  Every recorded session, <em>local.</em>
                </>
              }
              description="Filter by name, model, status, or tag. Click a session to read it like a court transcript: every turn, every tool call, every byte stays on this machine."
              actions={
                <>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        activeSurface: "replay",
                      }))
                    }
                  >
                    <RefreshCw aria-hidden="true" size={14} />
                    Replay selected
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => setTraceCardModalOpen(true)}
                  >
                    <FileJson aria-hidden="true" size={14} />
                    Export trace card
                  </button>
                </>
              }
            >
              <TraceBrowser
                search={state.search}
                setSearch={(search) =>
                  setState((current) => ({ ...current, search }))
                }
                selectedTraceId={state.selectedTraceId}
                onSelect={(selectedTraceId) =>
                  setState((current) => ({ ...current, selectedTraceId }))
                }
                sessions={filteredSessions}
              />
            </Section>
          )}

          {state.activeSurface === "replay" && (
            <Section
              eyebrow="Record & replay · deterministic regression"
              title={
                <>
                  Replay against the <em>baseline.</em>
                </>
              }
              description="Re-run a session against the current server and diff every turn. Nondeterminism is treated as a finding, not a footnote: caught at the gate, signed at the packet."
              actions={
                <>
                  <button
                    className="primary-button"
                    onClick={() => void runReplay()}
                  >
                    <RefreshCw aria-hidden="true" size={14} />
                    Replay
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        errorMessage:
                          "Replay nondeterminism detected: refund_order returned a different retry count.",
                      }))
                    }
                  >
                    <AlertTriangle aria-hidden="true" size={14} />
                    Simulate nondeterminism
                  </button>
                </>
              }
            >
              <div className="split-2-3">
                <Panel title="Replay controls" caption={selectedTrace.id}>
                  <Field
                    label="Replay JSON path"
                    value={replayPath}
                    onChange={setReplayPath}
                    placeholder="regressions/refund.json"
                  />
                  <Field
                    label="Assertions path"
                    value={assertionsPath}
                    onChange={setAssertionsPath}
                    placeholder="regressions/refund.assertions.yaml"
                  />
                  <TraceSummary trace={selectedTrace} />
                  <Timeline events={selectedTrace.events} />
                </Panel>
                <Panel title="Diff view" caption="Baseline vs candidate">
                  <DiffView result={replayResult} />
                </Panel>
              </div>
            </Section>
          )}

          {state.activeSurface === "a2a" && (
            <Section
              eyebrow="A2A · agent cards · capability negotiation"
              title={
                <>
                  Contract testing for the <em>handshake.</em>
                </>
              }
              description="Validate inter-agent contracts against the A2A spec, including lifecycle, capability negotiation, auth, and error paths."
              actions={
                <button
                  className="primary-button"
                  onClick={() => void runA2AContracts()}
                >
                  <Play aria-hidden="true" size={14} />
                  Run contract tests
                </button>
              }
            >
              <div className="split-2-3">
                <Panel title="Agent card" caption="Support Triage Agent">
                  <CodeBlock
                    label="agent-card.json"
                    value={JSON.stringify(agentCard, null, 2)}
                  />
                </Panel>
                <Panel
                  title="Test runner"
                  caption={`${runtimeA2AResults.length} checks`}
                >
                  <ResultList results={runtimeA2AResults} />
                </Panel>
              </div>
            </Section>
          )}

          {state.activeSurface === "observe" && (
            <Section
              eyebrow="Observability · OTLP · Phoenix · OpenAI event traces"
              title={
                <>
                  Capture every <em>span,</em> from anywhere.
                </>
              }
              description="Import OTEL GenAI spans, drop Phoenix or OpenAI event traces, or run the local receiver to capture live traffic."
              actions={
                <>
                  <button
                    className="secondary-button"
                    onClick={() => void importTraceFile()}
                  >
                    <Download aria-hidden="true" size={14} />
                    Import file
                  </button>
                  <button
                    className="primary-button"
                    disabled={state.edition === "browser"}
                    onClick={() => void toggleOtlpReceiver()}
                  >
                    <Play aria-hidden="true" size={14} />
                    Start receiver
                  </button>
                </>
              }
            >
              <div className="split-2-3">
                <Panel
                  title="Receiver"
                  caption={
                    state.edition === "browser"
                      ? "Browser edition · import only"
                      : "Local · :4317 / :4318"
                  }
                >
                  <Field
                    label="Trace file"
                    value={traceImportPath}
                    onChange={setTraceImportPath}
                    placeholder="trace.jsonl / otlp.json / phoenix.json"
                  />
                  <Field
                    label="Trace format"
                    value={traceImportFormat}
                    onChange={setTraceImportFormat}
                    placeholder="openai, otlp-json, phoenix, replay"
                  />
                  <Field
                    label="Trace store"
                    value={traceStorePath}
                    onChange={setTraceStorePath}
                    placeholder="agentstudio-live.ast"
                  />
                  <div className="empty-state">
                    <Eye aria-hidden="true" size={22} />
                    <strong>
                      {state.edition === "browser"
                        ? "OTLP receiver toggled off"
                        : "Drop OTLP JSON, proto, Phoenix JSON, or OpenAI event traces"}
                    </strong>
                    <span>
                      {state.edition === "browser"
                        ? "Use file import in browser edition."
                        : "Local HTTP listens on :4318 and gRPC on :4317."}
                    </span>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setError(
                        "OTLP malformed: content-type does not match JSON or protobuf trace payload.",
                      )
                    }
                  >
                    Simulate malformed payload
                  </button>
                </Panel>
                <Panel
                  title="Span timeline"
                  caption={`${runtimeSpans.length} spans · ${runtimeSpans.filter((s) => s.status === "error").length} error`}
                >
                  <SpanTimeline spans={runtimeSpans} />
                  <button
                    className="secondary-button"
                    onClick={() => void searchTraceStore()}
                  >
                    Search trace store
                  </button>
                </Panel>
              </div>
            </Section>
          )}

          {state.activeSurface === "compare" && (
            <Section
              eyebrow="Regression matrix across models"
              title={
                <>
                  The matrix is the <em>argument.</em>
                </>
              }
              description="Verified presets plus any custom model ID. Compare turn-by-turn behavior: drift, paraphrase, extra retries, refusals, against the trace you already trust."
              actions={
                <button
                  className="primary-button"
                  disabled={state.selectedModels.length < 2}
                  onClick={() => void runCompare()}
                >
                  <Play aria-hidden="true" size={14} />
                  Run matrix
                </button>
              }
            >
              <div className="compare-layout">
                <Panel
                  title="Models"
                  caption={`${state.selectedModels.length} selected`}
                >
                  <span className="picker-label">Verified presets</span>
                  <div className="model-grid">
                    {modelPresets.map((preset) => (
                      <ModelChip
                        key={preset.id}
                        preset={preset}
                        selected={state.selectedModels.includes(preset.id)}
                        onToggle={() => toggleModel(preset.id)}
                      />
                    ))}
                  </div>
                  <span className="picker-label">Custom model ID</span>
                  <div className="custom-model-row">
                    <input
                      aria-label="Custom model ID"
                      placeholder="e.g. internal-eval/agent-v3"
                      value={state.customModelId}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          customModelId: event.target.value,
                        }))
                      }
                    />
                    <button
                      className="secondary-button"
                      onClick={addCustomModel}
                      disabled={
                        !state.customModelId.trim() || customModelInList
                      }
                    >
                      Add
                    </button>
                  </div>
                  {state.selectedModels.length < 2 && (
                    <Notice tone="info">
                      Select at least two models to run the comparison matrix.
                    </Notice>
                  )}
                </Panel>
                <Panel title="Matrix" caption="Turn × model regression">
                  <Field
                    label="Baseline trace store"
                    value={compareBaseline}
                    onChange={setCompareBaseline}
                    placeholder="baseline.ast"
                  />
                  <Field
                    label="Candidate trace store"
                    value={compareCandidate}
                    onChange={setCompareCandidate}
                    placeholder="candidate.ast"
                  />
                  <CompareMatrix
                    selectedModels={state.selectedModels}
                    result={compareResult}
                  />
                </Panel>
              </div>
            </Section>
          )}

          {state.activeSurface === "ship" && (
            <Section
              eyebrow="Export regression artifacts · CI · PR · intake"
              a11yTitle="Ship"
              title={
                <>
                  Ship the <em>evidence,</em> not the adjectives.
                </>
              }
              description="Package the selected suite into CI artifacts, PR comments, or an AuraOne intake bundle. Every artifact is reproducible from the trace, signed at the gate."
              actions={
                <button
                  className="primary-button"
                  onClick={() => setTraceCardModalOpen(true)}
                >
                  <Download aria-hidden="true" size={14} />
                  Export bundle
                </button>
              }
            >
              <Notice tone="info">
                Ship exports call the CLI runtime when an input path and output
                path are supplied.
              </Notice>
              <Panel title="Export target" caption="CLI runtime">
                <Field
                  label="Input trace/store path"
                  value={exportInput}
                  onChange={setExportInput}
                  placeholder="agentstudio-live.ast"
                />
                <Field
                  label="Output path"
                  value={exportOut}
                  onChange={setExportOut}
                  placeholder="agentstudio-export.md"
                />
              </Panel>
              <div className="ship-grid">
                <ExportCard
                  title="GitHub Action"
                  caption=".github/workflows/agent-studio.yml"
                  value={exportBundle.workflow}
                />
                <ExportCard
                  title="JUnit"
                  caption="junit.xml"
                  value={exportBundle.junit}
                />
                <ExportCard
                  title="PR comment"
                  caption="Markdown report"
                  value={exportBundle.prComment}
                />
                <ExportCard
                  title="AuraOne intake"
                  caption="auraonepkg.agent-studio.v1"
                  value={exportBundle.intakeManifest}
                />
              </div>
            </Section>
          )}

          {state.activeSurface === "settings" && (
            <Section
              eyebrow="Models, Privacy, Sandbox, Updates, Telemetry"
              title={
                <>
                  Settings, <em>local-first.</em>
                </>
              }
              description="Configuration is local. Provider keys never leave the OS keychain on desktop, or the passphrase-protected storage in the browser."
              actions={
                <>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setError(
                        "Model API failed: provider returned 401 invalid_api_key. Raw provider error is available in details.",
                      )
                    }
                  >
                    Simulate provider error
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setError(
                        "Disk full / SQLite write failed: trace store could not append turn 12.",
                      )
                    }
                  >
                    Simulate disk full
                  </button>
                </>
              }
            >
              <div className="settings-grid">
                <Panel
                  title="Provider keys"
                  caption={
                    state.edition === "desktop"
                      ? "OS keychain"
                      : "Passphrase-protected browser storage"
                  }
                  span={2}
                >
                  <div className="provider-list">
                    {(Object.keys(state.providerKeys) as ModelVendor[])
                      .filter((vendor) => vendor !== "custom")
                      .map((vendor) => (
                        <ProviderRow
                          key={vendor}
                          vendor={vendor}
                          state={state.providerKeys[vendor]}
                          onVerify={() => verifyProviderKey(vendor)}
                          onForget={() => forgetProviderKey(vendor)}
                        />
                      ))}
                  </div>
                  <div className="key-form">
                    <label className="field">
                      <span>Add or replace key</span>
                      <div className="key-input-row">
                        <select
                          aria-label="Provider"
                          value={keyVendor}
                          onChange={(event) =>
                            setKeyVendor(event.target.value as ModelVendor)
                          }
                        >
                          {(Object.keys(vendorLabels) as ModelVendor[])
                            .filter((vendor) => vendor !== "custom")
                            .map((vendor) => (
                              <option key={vendor} value={vendor}>
                                {vendorLabels[vendor]}
                              </option>
                            ))}
                        </select>
                        <input
                          aria-label="Provider API key"
                          type="password"
                          value={keyInput}
                          placeholder="sk-…"
                          autoComplete="off"
                          onChange={(event) => setKeyInput(event.target.value)}
                        />
                        <input
                          aria-label="Local passphrase"
                          type="password"
                          value={keyPassphrase}
                          placeholder={
                            secretMode === "os-keychain"
                              ? "not used on desktop"
                              : "local passphrase"
                          }
                          autoComplete="current-password"
                          disabled={secretMode === "os-keychain"}
                          onChange={(event) =>
                            setKeyPassphrase(event.target.value)
                          }
                        />
                        <button
                          className="primary-button compact"
                          onClick={() => void saveProviderKey()}
                        >
                          <KeyRound aria-hidden="true" size={13} />
                          Save key
                        </button>
                      </div>
                      <div className="button-row">
                        <button
                          className="secondary-button compact"
                          onClick={() => void verifyProviderKey(keyVendor)}
                        >
                          Verify saved
                        </button>
                        <button
                          className="secondary-button compact"
                          onClick={() => void forgetProviderKey(keyVendor)}
                        >
                          Forget
                        </button>
                      </div>
                    </label>
                    {providerKeyStatus && (
                      <StatusPill
                        tone={providerKeyStatus.tone}
                        label={providerKeyStatus.label}
                      />
                    )}
                    <SavedProviderKeys records={savedProviderKeys} />
                    <Notice tone="info">
                      {secretMode === "os-keychain"
                        ? "Provider API keys are stored through the native Tauri OS keychain commands."
                        : "Provider API keys are stored in passphrase-protected browser storage in the web edition."}
                    </Notice>
                  </div>
                </Panel>
                <Panel title="Models" caption="Active presets and custom IDs">
                  <ul className="model-summary">
                    {modelPresets.map((preset) => (
                      <li key={preset.id}>
                        <span
                          className={`vendor-dot ${vendorTone[preset.vendor]}`}
                          aria-hidden="true"
                        />
                        <code>{preset.label}</code>
                        <small>
                          {vendorLabels[preset.vendor]} · {preset.contextWindow}
                        </small>
                      </li>
                    ))}
                    {state.selectedModels
                      .filter(
                        (model) =>
                          !modelPresets.some((preset) => preset.id === model),
                      )
                      .map((model) => (
                        <li key={model}>
                          <span
                            className={`vendor-dot ${vendorTone.custom}`}
                            aria-hidden="true"
                          />
                          <code>{model}</code>
                          <small>Custom model ID</small>
                        </li>
                      ))}
                  </ul>
                  <Field
                    label="Custom model ID"
                    value={state.customModelId}
                    onChange={(value) =>
                      setState((current) => ({
                        ...current,
                        customModelId: value,
                      }))
                    }
                    placeholder="e.g. internal-eval/agent-v3"
                  />
                  <button
                    className="secondary-button compact"
                    onClick={addCustomModel}
                    disabled={!state.customModelId.trim() || customModelInList}
                  >
                    Add model
                  </button>
                  <Field
                    label="Ollama endpoint"
                    value="http://localhost:11434"
                    onChange={() => undefined}
                  />
                </Panel>
                <Panel title="Privacy & telemetry">
                  <ToggleRow
                    label="Telemetry opt-in"
                    description="Aggregated counts only. No prompts, tool outputs, or keys."
                    checked={telemetryOptIn}
                    onChange={handleTelemetryToggle}
                  />
                  <ToggleRow
                    label="Crash reports opt-in"
                    description="Stack traces with redacted payload paths."
                    checked={crashReportsOptIn}
                    onChange={handleCrashToggle}
                  />
                  <StatusPill
                    tone={crashReportsOptIn ? "warning" : "success"}
                    dot
                    label={`Crash reports ${crashReportsOptIn ? "opted in" : "off"}`}
                  />
                  <ToggleRow
                    label="Redact trace preview before intake export"
                    description="Replace payloads with previews until the user confirms."
                    checked
                    onChange={() => undefined}
                  />
                </Panel>
                <Panel title="Sandbox & updates">
                  <ToggleRow
                    label="Sandbox stdio servers"
                    description="Containerized exec with denied network egress by default."
                    checked
                    onChange={() => undefined}
                  />
                  <ToggleRow
                    label="Verify signed update manifests"
                    description="Reject unsigned releases. Reads from the AuraOne update channel."
                    checked
                    onChange={() => undefined}
                  />
                  <StatusPill
                    tone="success"
                    dot
                    label="MIT licensed · v0.8.4"
                  />
                </Panel>
                <Panel title="Intake signing" caption={installKeyStatus}>
                  <button
                    className="secondary-button compact"
                    onClick={() => void ensureInstallKeypair()}
                  >
                    <Shield aria-hidden="true" size={13} />
                    Ensure install key
                  </button>
                  <Notice tone="info">
                    AuraOne intake exports reuse the shared platform keychain
                    scope for the local Ed25519 install keypair.
                  </Notice>
                </Panel>
                <Panel
                  title="Telemetry event log"
                  caption={telemetryOptIn ? "Streaming" : "Paused"}
                  span={2}
                >
                  <AuraTelemetryEventLog
                    events={toAuraTelemetryEvents(telemetryEntries)}
                  />
                  <pre
                    aria-label="Telemetry event log JSON"
                    className="code-block"
                  >
                    {JSON.stringify(telemetryEntries, null, 2)}
                  </pre>
                  {telemetryEntries.length === 0 && (
                    <ul
                      className="event-log"
                      aria-label="Telemetry sample events"
                    >
                      {sampleTelemetryEvents.map((event) => (
                        <li key={event.id}>
                          <code>{event.timestamp}</code>
                          <strong>{event.name}</strong>
                          <span>{event.summary}</span>
                          <StatusPill
                            tone={event.redacted ? "success" : "warning"}
                            label={event.redacted ? "redacted" : "raw"}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                <Panel
                  title="Empty and error state library"
                  caption="Reference inventory"
                  span={2}
                >
                  <StateGallery />
                </Panel>
              </div>
            </Section>
          )}
        </div>
      </main>

      {state.commandPaletteOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setState((current) => ({
                ...current,
                commandPaletteOpen: false,
              }));
            }
          }}
        >
          <div className="command-palette">
            <div className="command-input">
              <Search aria-hidden="true" size={15} />
              <input
                autoFocus
                aria-label="Search commands"
                placeholder="Search commands, surfaces, exports…"
              />
              <kbd>esc</kbd>
            </div>
            <div className="command-list">
              {surfaceCommands.map((command) => {
                const meta = surfaces.find(
                  (surface) => surface.id === command.surface,
                );
                const Icon = meta ? surfaceIcons[meta.id] : Command;
                return (
                  <button
                    key={command.id}
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        activeSurface: command.surface,
                        commandPaletteOpen: false,
                      }))
                    }
                  >
                    <Icon aria-hidden="true" size={14} />
                    <span>{command.title}</span>
                    <kbd>{command.key}</kbd>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {traceCardModalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Trace card export modal"
        >
          <div className="export-modal">
            <div className="modal-heading">
              <div>
                <span>Trace card export</span>
                <strong>{selectedTrace.name}</strong>
              </div>
              <button
                className="icon-button"
                aria-label="Close trace card export"
                onClick={() => setTraceCardModalOpen(false)}
              >
                <XCircle aria-hidden="true" size={15} />
              </button>
            </div>
            <TraceSummary trace={selectedTrace} />
            <CodeBlock value={exportBundle.traceCard} label="trace-card.json" />
            <div className="button-row right">
              <button
                className="ghost-button"
                onClick={() => setTraceCardModalOpen(false)}
              >
                Close
              </button>
              <button
                className="primary-button"
                onClick={() => void exportTraceCard()}
              >
                <Download aria-hidden="true" size={14} />
                Export trace card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  a11yTitle,
  eyebrow,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  a11yTitle?: string;
  eyebrow: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface">
      <header className="surface-header">
        <div>
          <span className="surface-eyebrow">{eyebrow}</span>
          <h1 aria-label={a11yTitle}>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="surface-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

function Panel({
  title,
  caption,
  span,
  density,
  children,
}: {
  title: string;
  caption?: string;
  span?: number;
  density?: "compact" | "default";
  children: ReactNode;
}) {
  return (
    <section
      className={`panel${density === "compact" ? " panel-compact" : ""}`}
      style={span ? { gridColumn: `span ${span}` } : undefined}
    >
      <header className="panel-header">
        <h2>{title}</h2>
        {caption && <span className="panel-caption">{caption}</span>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="toggle-row-text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
    </label>
  );
}

function ContextChip({
  icon: Icon,
  label,
  value,
  tone,
  truncate,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "ok" | "warn" | "info";
  truncate?: boolean;
}) {
  return (
    <div className={`context-chip${tone ? ` context-chip-${tone}` : ""}`}>
      <Icon aria-hidden="true" size={12} />
      <span>{label}</span>
      <strong className={truncate ? "truncate" : undefined}>{value}</strong>
    </div>
  );
}

function ManifestInspector({ manifest }: { manifest: Manifest }) {
  return (
    <div className="manifest-inspector">
      <div className="stats-row">
        <Stat label="Tools" value={String(manifest.tools.length)} />
        <Stat label="Resources" value={String(manifest.resources.length)} />
        <Stat label="Prompts" value={String(manifest.prompts.length)} />
      </div>
      {manifest.tools.length === 0 &&
        manifest.resources.length === 0 &&
        manifest.prompts.length === 0 && (
          <EmptyState
            icon={Plug}
            title="No manifest loaded"
            body="Connect to a live MCP endpoint to inspect runtime capabilities."
          />
        )}
      <div className="manifest-section">
        <span className="manifest-section-label">Tools</span>
        {manifest.tools.map((tool) => (
          <article className="manifest-item" key={tool.name}>
            <div>
              <strong>{tool.title}</strong>
              <span>{tool.description}</span>
            </div>
            <RiskBadges findings={tool.risk} />
          </article>
        ))}
      </div>
      <div className="manifest-section">
        <span className="manifest-section-label">Resources</span>
        {manifest.resources.map((resource) => (
          <article className="manifest-item" key={resource.uri}>
            <div>
              <strong>{resource.name}</strong>
              <span>{resource.uri}</span>
            </div>
            <code>{resource.mimeType}</code>
          </article>
        ))}
      </div>
      <div className="manifest-section">
        <span className="manifest-section-label">Prompts</span>
        {manifest.prompts.map((prompt) => (
          <article className="manifest-item" key={prompt.name}>
            <div>
              <strong>{prompt.name}</strong>
              <span>{prompt.description}</span>
            </div>
          </article>
        ))}
      </div>
      <CodeBlock
        value={JSON.stringify(manifest, null, 2)}
        label="manifest.json"
      />
    </div>
  );
}

function SchemaForm({ schema }: { schema: Record<string, unknown> }) {
  const properties = (schema.properties ?? {}) as Record<
    string,
    { type?: string; enum?: string[] }
  >;
  return (
    <div className="schema-form">
      <span className="picker-label">Schema</span>
      {Object.entries(properties).map(([key, value]) => (
        <label className="field compact" key={key}>
          <span>
            {key} <code>{value.type}</code>
          </span>
          {value.enum ? (
            <select>
              {value.enum.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          ) : (
            <input />
          )}
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
  sessions: TraceSession[];
}) {
  return (
    <div className="trace-grid">
      <Panel title="Sessions" caption={`${props.sessions.length} local`}>
        <div className="trace-toolbar">
          <Search aria-hidden="true" size={13} />
          <input
            aria-label="Search traces"
            value={props.search}
            onChange={(event) => props.setSearch(event.target.value)}
            placeholder="refund, retry, safety…"
          />
        </div>
        {props.sessions.length === 0 && (
          <EmptyState
            icon={Search}
            title="No sessions yet"
            body="Record an MCP run or import an OTLP trace to populate this list."
          />
        )}
        <Virtuoso
          className="trace-list"
          data={props.sessions}
          itemContent={(_, session) => {
            const summary = summarizeSession(session);
            return (
              <button
                className={
                  props.selectedTraceId === session.id
                    ? "trace-card active"
                    : "trace-card"
                }
                onClick={() => props.onSelect(session.id)}
              >
                <div className="trace-card-head">
                  <strong>{session.name}</strong>
                  <StatusPill
                    tone={
                      session.status === "passed"
                        ? "success"
                        : session.status === "failed"
                          ? "danger"
                          : "warning"
                    }
                    label={session.status}
                  />
                </div>
                <div className="trace-card-meta">
                  <code>{session.model}</code>
                  <span>{summary.toolCalls} calls</span>
                  <span>{summary.latencyMs} ms</span>
                  <span>${summary.costUsd.toFixed(4)}</span>
                </div>
              </button>
            );
          }}
        />
      </Panel>
      <Panel
        title="Session detail"
        caption={
          (
            props.sessions.find(
              (session) => session.id === props.selectedTraceId,
            ) ?? emptyTrace
          ).model
        }
      >
        <Timeline
          events={
            (
              props.sessions.find(
                (session) => session.id === props.selectedTraceId,
              ) ?? emptyTrace
            ).events
          }
        />
      </Panel>
    </div>
  );
}

function LogPanel({ logs }: { logs: string[] }) {
  return (
    <div className="log-panel" role="log" aria-label="Server logs panel">
      <header>
        <strong>Server logs</strong>
        <span>Stdio lifecycle and protocol events</span>
      </header>
      <CodeBlock
        value={
          logs.length > 0 ? logs.join("\n") : "No runtime lifecycle events yet."
        }
        label="lifecycle.log"
      />
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
        <EmptyState
          key={state}
          icon={CircleDashed}
          title={state}
          body="Actions stay disabled until this prerequisite is available."
        />
      ))}
    </div>
  );
}

export function Timeline({
  events,
  compact,
}: {
  events: TimelineEvent[];
  compact?: boolean;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={CircleDashed}
        title="No timeline events"
        body="Runtime events appear here after recording or importing traces."
      />
    );
  }
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
    <ol className={`timeline${compact ? " timeline-compact" : ""}`}>
      {events.map((event) => (
        <TimelineRow as="li" event={event} key={event.id} />
      ))}
    </ol>
  );
}

function TimelineRow({
  as: Component = "div",
  event,
}: {
  as?: "div" | "li";
  event: TimelineEvent;
}) {
  return (
    <Component className={`timeline-row timeline-${event.kind}`}>
      <span className={`timeline-dot ${event.kind}`} aria-hidden="true" />
      <div>
        <div className="timeline-head">
          <strong>{event.title}</strong>
          <time>{event.timestamp}</time>
        </div>
        <p>{event.body}</p>
        {(event.latencyMs || event.costUsd) && (
          <div className="timeline-meta">
            {event.latencyMs ? <span>{event.latencyMs} ms</span> : null}
            {event.costUsd ? <span>${event.costUsd.toFixed(4)}</span> : null}
          </div>
        )}
      </div>
    </Component>
  );
}

function DiffView({ result }: { result: unknown }) {
  if (!result) {
    return (
      <EmptyState
        icon={GitCompare}
        title="No replay result"
        body="Run replay with real replay and assertion files to render the diff output."
      />
    );
  }
  return (
    <CodeBlock
      value={JSON.stringify(result, null, 2)}
      label="replay-result.json"
    />
  );
}

function ResultList({ results }: { results: A2ATestResult[] }) {
  if (results.length === 0) {
    return (
      <EmptyState
        icon={Workflow}
        title="No contract results"
        body="Run A2A contract tests to populate this runner."
      />
    );
  }
  return (
    <div className="result-list">
      {results.map((result) => (
        <article key={result.id} className={`result result-${result.status}`}>
          {result.status === "pass" ? (
            <CheckCircle2 aria-hidden="true" size={15} />
          ) : (
            <XCircle aria-hidden="true" size={15} />
          )}
          <div>
            <strong>{result.name}</strong>
            <span>{result.detail}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function SpanTimeline({ spans }: { spans: Span[] }) {
  if (spans.length === 0) {
    return (
      <EmptyState
        icon={Eye}
        title="No spans captured"
        body="Start the OTLP receiver or import traces to populate this view."
      />
    );
  }
  const total =
    spans[spans.length - 1].startMs + spans[spans.length - 1].durationMs;
  return (
    <div className="span-timeline">
      {spans.map((span) => {
        const left = (span.startMs / total) * 100;
        const width = Math.max((span.durationMs / total) * 100, 6);
        return (
          <div className="span-row" key={span.id}>
            <div className="span-row-head">
              <code>{span.name}</code>
              <span>{span.durationMs} ms</span>
            </div>
            <div className="span-track">
              <span
                className={`span-bar span-${span.status}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompareMatrix({
  selectedModels,
  result,
}: {
  selectedModels: string[];
  result: unknown;
}) {
  if (selectedModels.length === 0) {
    return (
      <EmptyState
        icon={GitCompare}
        title="Pick at least two models"
        body="Verified presets are recommended. Custom IDs work for internal evals."
      />
    );
  }
  if (!result) {
    return (
      <EmptyState
        icon={GitCompare}
        title="No comparison result"
        body="Run compare against baseline and candidate trace stores to render runtime output."
      />
    );
  }
  return (
    <CodeBlock
      value={JSON.stringify(result, null, 2)}
      label="compare-result.json"
    />
  );
}

function ExportCard({
  title,
  caption,
  value,
}: {
  title: string;
  caption: string;
  value: string;
}) {
  return (
    <Panel title={title} caption={caption}>
      <CodeBlock value={value} label={caption} />
      <div className="button-row right">
        <button
          className="ghost-button"
          onClick={() => void navigator.clipboard?.writeText(value)}
        >
          <Copy aria-hidden="true" size={13} />
          Copy
        </button>
        <button className="secondary-button">
          <Download aria-hidden="true" size={13} />
          Export
        </button>
      </div>
    </Panel>
  );
}

function TraceSummary({ trace }: { trace: TraceSession }) {
  const summary = summarizeSession(trace);
  return (
    <div className="stats-row">
      <Stat label="Trace" value={trace.name} />
      <Stat label="Model" value={trace.model} mono />
      <Stat label="Tool calls" value={String(summary.toolCalls)} />
      <Stat label="Latency" value={`${summary.latencyMs} ms`} />
      <Stat label="Cost" value={`$${summary.costUsd.toFixed(4)}`} />
    </div>
  );
}

function StatusPill({
  label,
  tone,
  dot,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  dot?: boolean;
}) {
  return (
    <span className={`status status-${tone}${dot ? " status-dot" : ""}`}>
      {dot && <span className="status-indicator" aria-hidden="true" />}
      {label}
    </span>
  );
}

function RiskBadges({
  findings,
}: {
  findings: Array<{ severity: "pass" | "warn" | "fail"; message: string }>;
}) {
  return (
    <span className="risk-badges">
      {findings.map((finding) => (
        <span
          className={`risk risk-${finding.severity}`}
          key={finding.message}
          title={finding.message}
        >
          {finding.severity}
        </span>
      ))}
    </span>
  );
}

function ModelChip({
  preset,
  selected,
  onToggle,
}: {
  preset: ModelPreset;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`model-chip${selected ? " active" : ""}`}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <span
        className={`vendor-dot ${vendorTone[preset.vendor]}`}
        aria-hidden="true"
      />
      <div className="model-chip-body">
        <code>{preset.label}</code>
        <span>
          {vendorLabels[preset.vendor]} · {preset.contextWindow}
        </span>
      </div>
      <span className="model-chip-state">
        {selected ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

function SavedProviderKeys({
  records,
}: {
  records: Array<{ provider: string; updatedAt: string }>;
}) {
  if (records.length === 0) {
    return <span className="muted-inline">No saved provider keys yet.</span>;
  }
  return (
    <div className="saved-provider-keys" aria-label="Saved provider keys">
      {records.map((record) => (
        <span key={record.provider}>
          {vendorLabels[record.provider as ModelVendor] ?? record.provider}{" "}
          saved {formatProviderKeyTimestamp(record.updatedAt)}
        </span>
      ))}
    </div>
  );
}

function formatProviderKeyTimestamp(updatedAt: string): string {
  const timestamp = Date.parse(updatedAt);
  return Number.isNaN(timestamp)
    ? updatedAt
    : new Date(timestamp).toLocaleDateString();
}

function ProviderRow({
  vendor,
  state,
  onVerify,
  onForget,
}: {
  vendor: ModelVendor;
  state: {
    status: ProviderKeyStatus;
    hint: string;
    lastVerifiedAt: string | null;
  };
  onVerify: () => void;
  onForget: () => void;
}) {
  const toneByStatus: Record<
    ProviderKeyStatus,
    "success" | "warning" | "danger" | "neutral"
  > = {
    none: "neutral",
    saved: "warning",
    verified: "success",
    error: "danger",
  };
  const labelByStatus: Record<ProviderKeyStatus, string> = {
    none: "No key",
    saved: "Saved",
    verified: "Verified",
    error: "Verification failed",
  };
  return (
    <div className="provider-row">
      <div className="provider-row-head">
        <span
          className={`vendor-dot ${vendorTone[vendor]}`}
          aria-hidden="true"
        />
        <strong>{vendorLabels[vendor]}</strong>
        <StatusPill
          tone={toneByStatus[state.status]}
          dot
          label={labelByStatus[state.status]}
        />
      </div>
      <div className="provider-row-meta">
        <code>{state.hint || "—"}</code>
        {state.lastVerifiedAt && <span>verified {state.lastVerifiedAt}</span>}
      </div>
      <div className="provider-row-actions">
        <button
          className="ghost-button"
          onClick={onVerify}
          disabled={state.status === "none"}
        >
          Verify
        </button>
        <button
          className="ghost-button"
          onClick={onForget}
          disabled={state.status === "none"}
        >
          Forget
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>{value}</strong>
    </div>
  );
}

function Notice({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  return <div className={`notice notice-${tone ?? "info"}`}>{children}</div>;
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="empty-state">
      <Icon aria-hidden="true" size={22} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function CodeBlock({
  value,
  label,
  muted,
}: {
  value: string;
  label?: string;
  muted?: boolean;
}) {
  return (
    <div className={`code-frame${muted ? " code-frame-muted" : ""}`}>
      {label && <div className="code-frame-head">{label}</div>}
      <pre
        className="code-block"
        tabIndex={0}
        aria-label={label ?? "Code sample"}
      >
        {value}
      </pre>
    </div>
  );
}

function OperationBanner({ label }: { label: string }) {
  return (
    <div className="operation-banner" role="status">
      <RefreshCw aria-hidden="true" size={14} />
      <span>{label}</span>
    </div>
  );
}

function ErrorBanner({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-message">
        <AlertTriangle aria-hidden="true" size={14} />
        {message}
      </span>
      <span className="error-banner-actions">
        <button
          className="ghost-button"
          onClick={() => void navigator.clipboard?.writeText(message)}
        >
          Copy details
        </button>
        <button className="ghost-button" onClick={onClose}>
          Dismiss
        </button>
      </span>
    </div>
  );
}
