import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Editor } from "@monaco-editor/react";
import { Virtuoso } from "react-virtuoso";
import { AuraTelemetryEventLog } from "@auraone/aura-ide-kit";
import {
  TelemetryEventLog,
  type TelemetryLogEntry,
  createTelemetryEvent,
  toAuraTelemetryEvents,
  toLocalTelemetryLogEntries,
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
  KeyRound,
  MoreHorizontal,
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
  demoCompareResult,
  demoReplayResult,
  filterSessions,
  modelPresets,
  models,
  sampleManifest,
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
  ComparisonEvidence,
  ConnectionDraft,
  ExportBundle,
  ModelPreset,
  ModelVendor,
  Manifest,
  ProviderKeyStatus,
  ReplayEvidence,
  Span,
  Surface,
  TimelineEvent,
  TraceSession,
} from "./types";
import {
  deleteProviderKeySecret,
  getRuntimeCapabilities,
  listProviderKeySecrets,
  loadProviderKeySecret,
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
  runtimeTraceImport,
  runtimeTraceSearch,
  runtimeUnavailableMessage,
} from "./runtimeBridge";
import {
  artifactForKind,
  buildLocalExportBundle,
  deriveRuntimeOutputPath,
  downloadLocalArtifact,
  exportArtifactDefinitions,
  runtimeExportFormat,
  sha256Hex,
  type ArtifactExportKind,
  type ExportEvidenceContext,
  type ExportOperationKey,
} from "./exportArtifacts";
import {
  checkForAgentStudioUpdate,
  type AgentStudioUpdateResult,
} from "./updater";
import studioLogo from "./assets/agentstudio-logo.svg";

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
const appVersion = "0.2.0";
const updateChannel =
  import.meta.env.VITE_AGENT_STUDIO_UPDATE_CHANNEL ?? "stable";
const docsUrl = "https://auraone.ai/resources/docs/agent-studio-open";
const repoUrl = "https://github.com/auraoneai/agent-studio-open";
const desktopReleaseUrl =
  import.meta.env.VITE_AGENT_STUDIO_DESKTOP_RELEASE_URL ??
  `${repoUrl}/releases/latest`;

function isHostedPreviewHost() {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("preview") === "1") {
    return true;
  }
  return /(^|\.)agentstudio\.auraone\.ai$|\.vercel\.app$/.test(
    window.location.hostname,
  );
}

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

const mobilePrimarySurfaces: Surface[] = [
  "connect",
  "traces",
  "replay",
  "compare",
  "ship",
];

type ExportOperationStatus = {
  state: "idle" | "running" | "success" | "error";
  message: string;
};

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
    id: "a2a",
    title: "Validate A2A contract",
    surface: "a2a",
    key: "Cmd/Ctrl+5",
  },
  {
    id: "observe",
    title: "Open Data Network",
    surface: "observe",
    key: "Cmd/Ctrl+6",
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
      <img className="studio-mark-image" src={studioLogo} alt="" />
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
  const runtime = useMemo(() => getRuntimeCapabilities(), []);
  const state = useStudioStore((store) => store.state);
  const setState = useStudioStore((store) => store.setState);
  const shellRef = useRef<HTMLDivElement>(null);
  const [connection, setConnection] = useState<ConnectionDraft>(() =>
    demoMode
      ? demoConnection
      : runtime.localProcesses
        ? initialConnection
        : {
            ...initialConnection,
            transport: "http",
            command: "",
            args: "",
            cwd: "",
          },
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
  const [replayPath, setReplayPath] = useState(
    demoMode ? "regressions/refund.json" : "",
  );
  const [assertionsPath, setAssertionsPath] = useState(
    demoMode ? "regressions/refund.assertions.yaml" : "",
  );
  const [replayResult, setReplayResult] = useState<ReplayEvidence | null>(
    demoMode ? demoReplayResult : null,
  );
  const [compareBaseline, setCompareBaseline] = useState(
    demoMode ? "baseline/support-refund.ast" : "",
  );
  const [compareCandidate, setCompareCandidate] = useState(
    demoMode ? "candidate/support-refund.ast" : "",
  );
  const [compareResult, setCompareResult] =
    useState<ComparisonEvidence | null>(
    demoMode ? demoCompareResult : null,
    );
  const [exportInput, setExportInput] = useState("agentstudio-live.ast");
  const [exportOut, setExportOut] = useState("agentstudio-export.md");
  const [exportStatuses, setExportStatuses] = useState<
    Partial<Record<ExportOperationKey, ExportOperationStatus>>
  >({});
  const [exportGeneratedAt] = useState(() =>
    demoMode ? "2026-05-12T09:42:30.000Z" : new Date().toISOString(),
  );
  const [traceCardModalOpen, setTraceCardModalOpen] = useState(false);
  const [telemetryOptIn, setTelemetryOptIn] = useState(false);
  const [crashReportsOptIn, setCrashReportsOptIn] = useState(false);
  const [telemetryLog] = useState(() => new TelemetryEventLog());
  const [telemetryEntries, setTelemetryEntries] = useState<
    readonly TelemetryLogEntry[]
  >([]);
  const [installKeyStatus, setInstallKeyStatus] = useState(
    runtime.intakeSigning
      ? "Not checked"
      : "Unavailable in browser; no key generated",
  );
  const [sessionId] = useState(() => createUuid());
  const [installId] = useState(() => createUuid());
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
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateResult, setUpdateResult] =
    useState<AgentStudioUpdateResult | null>(null);

  const selectedTrace =
    runtimeTraceSessions.find(
      (session) => session.id === state.selectedTraceId,
    ) ??
    runtimeTraceSessions[0] ??
    emptyTrace;
  const exportBundle = useMemo<ExportBundle>(
    () =>
      buildExportBundle([
        selectedTrace,
        ...runtimeTraceSessions.filter(
          (session) => session.id !== selectedTrace.id,
        ),
      ]),
    [runtimeTraceSessions, selectedTrace],
  );
  const exportEvidenceContext = useMemo<ExportEvidenceContext>(
    () => ({
      generatedAt: exportGeneratedAt,
      sourceBuild: {
        product: "Agent Studio Open",
        version: appVersion,
        commit:
          import.meta.env.VITE_AGENT_STUDIO_SOURCE_COMMIT ??
          `version-${appVersion}`,
        state:
          import.meta.env.VITE_AGENT_STUDIO_SOURCE_STATE ??
          (demoMode ? "synthetic-demo" : "runtime"),
        sourceDigest:
          import.meta.env.VITE_AGENT_STUDIO_SOURCE_DIGEST ??
          sha256Hex(`Agent Studio Open@${appVersion}`),
      },
      sourceTrace: {
        id: selectedTrace.id,
        path: exportInput,
        content: exportBundle.sourceTrace,
      },
      replay: replayResult,
      comparison: compareResult,
    }),
    [
      compareResult,
      exportBundle.sourceTrace,
      exportGeneratedAt,
      exportInput,
      replayResult,
      selectedTrace.id,
    ],
  );
  const selectedTool =
    manifest.tools.find((tool) => tool.name === state.selectedToolName) ??
    manifest.tools[0] ??
    null;
  const filteredSessions = useMemo(
    () => filterSessions(runtimeTraceSessions, state.search),
    [runtimeTraceSessions, state.search],
  );
  const selectedTraceSummary = useMemo(
    () => summarizeSession(selectedTrace),
    [selectedTrace],
  );
  const jsonValidation = useMemo(() => validateJson(jsonValue), [jsonValue]);
  const auraTheme = state.theme === "contrast" ? "high-contrast" : state.theme;
  const customModelInList =
    state.customModelId.trim().length > 0 &&
    state.selectedModels.includes(state.customModelId.trim());
  const secretMode = runtime.osKeychain ? "os-keychain" : "browser-vault";
  const localTelemetryEntries = useMemo(
    () => toLocalTelemetryLogEntries(telemetryEntries),
    [telemetryEntries],
  );
  const modalOpen = state.commandPaletteOpen || traceCardModalOpen;

  useEffect(() => {
    document.documentElement.dataset.theme = auraTheme;
    document.documentElement.dataset.edition = runtime.edition;
    document.documentElement.dataset.demo = demoMode ? "true" : "false";
  }, [auraTheme, runtime.edition]);

  useEffect(() => {
    if (!modalOpen || !shellRef.current) {
      return;
    }
    const background = Array.from(shellRef.current.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        !element.classList.contains("modal-backdrop"),
    );
    for (const element of background) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const element of background) {
        element.removeAttribute("inert");
        element.removeAttribute("aria-hidden");
      }
    };
  }, [modalOpen]);

  const refreshSavedProviderKeys = async () => {
    try {
      const records = await listProviderKeySecrets();
      setSavedProviderKeys((current) =>
        current.length === records.length &&
        current.every(
          (record, index) =>
            record.provider === records[index]?.provider &&
            record.updatedAt === records[index]?.updatedAt,
        )
          ? current
          : records,
      );
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
    if (!demoMode) {
      return;
    }
    setState((current) => {
      if (!current.firstRunOpen && !current.recording) {
        return current;
      }
      return {
        ...current,
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
          version: appVersion,
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
    if (!runtime.localProcesses && connection.transport === "stdio") {
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
    if (!runtime.localListeners) {
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
      const imported = result;
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
    if (demoMode) {
      setReplayResult(demoReplayResult);
      runOperation("replay evidence refreshed");
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
    if (demoMode) {
      setCompareResult(demoCompareResult);
      runOperation("comparison evidence refreshed");
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

  const setExportOperationStatus = (
    key: ExportOperationKey,
    status: ExportOperationStatus,
  ) => {
    setExportStatuses((current) => ({ ...current, [key]: status }));
  };

  const exportArtifact = async (kind: ArtifactExportKind) => {
    if (!exportInput.trim() || !exportOut.trim()) {
      setError("Export requires an input path and output path.");
      return;
    }
    const definition = exportArtifactDefinitions.find(
      (item) => item.kind === kind,
    );
    const operationLabel = definition?.title ?? kind;
    setExportOperationStatus(kind, {
      state: "running",
      message: `Exporting ${operationLabel}…`,
    });
    try {
      setState((current) => ({
        ...current,
        loadingOperation: `exporting ${operationLabel}`,
        errorMessage: null,
      }));
      const localExport = demoMode || !runtime.tauri;
      if (localExport) {
        const artifact = await artifactForKind(
          exportBundle,
          exportEvidenceContext,
          kind,
        );
        downloadLocalArtifact(artifact);
        setLastResponse(JSON.stringify(artifact.evidence, null, 2));
        setExportOperationStatus(kind, {
          state: "success",
          message: `Downloaded ${artifact.filename}`,
        });
      } else {
        const outputPath = deriveRuntimeOutputPath(exportOut, kind);
        const result = await runtimeExportBundle(
          kind,
          exportInput.trim(),
          outputPath,
          runtimeExportFormat(kind),
        );
        setLastResponse(JSON.stringify(result, null, 2));
        setExportOperationStatus(kind, {
          state: "success",
          message: `Exported to ${outputPath}`,
        });
      }
      setState((current) => ({ ...current, loadingOperation: null }));
    } catch (error) {
      setState((current) => ({ ...current, loadingOperation: null }));
      const message =
        error instanceof Error ? error.message : `${operationLabel} export failed.`;
      setExportOperationStatus(kind, { state: "error", message });
      setError(message);
    }
  };

  const runExportBundle = async () => {
    setExportOperationStatus("bundle", {
      state: "running",
      message: "Packaging 5 deterministic artifacts…",
    });
    try {
      setState((current) => ({
        ...current,
        loadingOperation: "packaging export bundle",
        errorMessage: null,
      }));
      const artifact = await buildLocalExportBundle(
        exportBundle,
        exportEvidenceContext,
      );
      downloadLocalArtifact(artifact);
      setLastResponse(JSON.stringify(artifact.evidence, null, 2));
      setExportOperationStatus("bundle", {
        state: "success",
        message: `Downloaded ${artifact.filename}`,
      });
      setState((current) => ({ ...current, loadingOperation: null }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Export bundle failed.";
      setExportOperationStatus("bundle", { state: "error", message });
      setState((current) => ({ ...current, loadingOperation: null }));
      setError(message);
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
    if (!runtime.intakeSigning) {
      setInstallKeyStatus("Unavailable in browser; no key generated");
      return;
    }
    setInstallKeyStatus("Checking the OS keychain...");
    try {
      const keypair = await ensureAgentIntakeInstallSigningKeypair();
      setInstallKeyStatus(
        `${keypair.algorithm} identity stored in the OS keychain · created ${new Date(
          keypair.created_at,
        ).toLocaleDateString()}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The intake signing identity is unavailable.";
      setInstallKeyStatus(message);
      setError(message);
    }
  };

  const activeSurfaceMeta =
    surfaces.find((surface) => surface.id === state.activeSurface) ??
    surfaces[0];
  const hostedPreviewMode = demoMode || isHostedPreviewHost();

  return (
    <div
      ref={shellRef}
      className="studio-shell aura-ide-root"
      data-theme={auraTheme}
      data-modal-open={modalOpen ? "true" : "false"}
    >
      <header className="mobile-appbar">
        <div className="mobile-brand">
          <StudioMark size={28} />
          <div>
            <strong>Agent Studio</strong>
            <span>{activeSurfaceMeta.label}</span>
          </div>
        </div>
        <div className="mobile-appbar-actions">
          <span className="mobile-preview-indicator" aria-hidden="true" />
          <span className="sr-only">
            {hostedPreviewMode ? "Hosted preview" : "Local workspace"}
          </span>
          <button
            className="icon-button"
            aria-label="Search commands"
            onClick={() =>
              setState((current) => ({ ...current, commandPaletteOpen: true }))
            }
          >
            <Search aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="Agent Studio Open navigation">
        <div className="brand">
          <StudioMark size={30} />
          <div className="brand-text">
            <strong>Agent Studio</strong>
            <span className="sr-only">Agent Studio Open</span>
            <span>
              {demoMode
                ? "Hosted demo"
                : runtime.tauri
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
                      data-surface={surface.id}
                      onClick={() =>
                        setState((current) => ({
                          ...current,
                          activeSurface: surface.id,
                        }))
                      }
                      aria-current={isActive ? "page" : undefined}
                      aria-label={
                        surface.id === "settings"
                          ? "Open settings"
                          : `Open ${surface.label} workspace`
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
            aria-label="Open command palette"
            onClick={() =>
              setState((current) => ({ ...current, commandPaletteOpen: true }))
            }
          >
            <Command aria-hidden="true" size={14} />
            <span>Command palette</span>
            <kbd>⌘K</kbd>
          </button>
          <div
            className="runtime-edition"
            aria-label={`Runtime edition: ${runtime.edition}`}
          >
            <Shield aria-hidden="true" size={12} />
            <span>{runtime.tauri ? "Desktop runtime" : "Browser runtime"}</span>
          </div>
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
                label={
                  state.recording
                    ? "Recording"
                    : hostedPreviewMode
                      ? "Browser preview"
                      : runtime.tauri
                        ? "Idle · Local"
                        : "Browser runtime"
                }
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
              aria-pressed={state.recording}
              disabled={demoMode}
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
            <span
              className="icon-button topbar-decoration"
              aria-hidden="true"
            >
              <Settings aria-hidden="true" size={15} />
            </span>
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
            value={telemetryOptIn ? "Local preview" : "Local-only"}
            tone="ok"
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
                1. Confirm the detected runtime. 2. Set provider keys. 3.
                Connect a sample MCP server, then run your first replay.
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
        {hostedPreviewMode && (
          <div className="preview-status" role="status">
            <span className="preview-status-copy">
              <span className="status-indicator" aria-hidden="true" />
              <span className="preview-status-text">
                Hosted preview · synthetic fixtures · local-only
              </span>
            </span>
            <span className="preview-status-links">
              <a href={docsUrl}>
                <BookOpen aria-hidden="true" size={13} />
                Docs
              </a>
              <a href={desktopReleaseUrl} target="_blank" rel="noreferrer">
                <Download aria-hidden="true" size={13} />
                Desktop
              </a>
            </span>
          </div>
        )}

        <div className="surface-wrap">
          {state.activeSurface === "connect" && (
            <Section
              eyebrow="MCP endpoint"
              title="Connect endpoint"
              description="Configure transport, inspect the discovered manifest, and review runtime evidence."
              actions={
                <button
                  className="primary-button"
                  onClick={() => void runConnect()}
                >
                  <Play aria-hidden="true" size={14} />
                  {demoMode ? "Inspect endpoint" : "Connect"}
                </button>
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
                          !runtime.localProcesses && transport === "stdio";
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
                  {!runtime.localProcesses && (
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
              eyebrow="Schema-aware request"
              title="Compose tool call"
              description="Build and validate a payload, then capture the response into the local trace store."
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
                        fontSize: 13,
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
              eyebrow="Local trace store"
              title="Trace sessions"
              description="Filter recorded sessions and inspect each model turn, tool call, result, and timing."
              actions={
                <>
                  <button
                    className="primary-button"
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
              <div
                className="mobile-proof-summary mobile-trace-proof"
                data-testid="mobile-trace-proof"
              >
                <span>
                  <strong>{selectedTrace.events.length}</strong> events
                </span>
                <span>
                  <strong>{selectedTraceSummary.toolCalls}</strong> tool calls
                </span>
                <span>
                  <strong>{selectedTraceSummary.latencyMs} ms</strong> duration
                </span>
                <span>Session detail and timeline below</span>
              </div>
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
              eyebrow="Deterministic regression"
              title="Replay run"
              description="Re-run the selected trace and review assertion outcomes against its baseline."
              actions={
                <button
                  className="primary-button"
                  onClick={() => void runReplay()}
                >
                  <RefreshCw aria-hidden="true" size={14} />
                  Run replay
                </button>
              }
            >
              <div className="split-2-3 replay-layout">
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
              eyebrow="A2A contract"
              title="Validate agent handshake"
              description="Check agent-card fields, capability negotiation, lifecycle, authentication, and error paths."
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
              eyebrow="OTLP and trace imports"
              title="Evidence data network"
              description="Inspect linked spans, model turns, tool calls, replay outcomes, and release artifacts."
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
                    disabled={!runtime.localListeners}
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
                    !runtime.localListeners
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
                      {!runtime.localListeners
                        ? "OTLP receiver toggled off"
                        : "Drop OTLP JSON, proto, Phoenix JSON, or OpenAI event traces"}
                    </strong>
                    <span>
                      {!runtime.localListeners
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
                  title="Evidence network"
                  caption={`${runtimeSpans.length} linked spans · ${runtimeSpans.filter((s) => s.status === "error").length} blocked`}
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
              eyebrow="Cross-model regression"
              title="Compare behavior"
              description="Compare tool sequence, arguments, policy decisions, retries, and final responses."
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
              eyebrow="CI and release artifacts"
              a11yTitle="Ship"
              title="Export for CI"
              description="Package the selected suite as workflow, JUnit, PR, trace-card, or AuraOne intake evidence."
              actions={
                <button
                  className="primary-button"
                  disabled={exportStatuses.bundle?.state === "running"}
                  onClick={() => void runExportBundle()}
                >
                  <Download aria-hidden="true" size={14} />
                  Export bundle
                </button>
              }
            >
              <Notice tone="info">
                Browser exports download deterministic local artifacts. Desktop
                card exports call the matching CLI kind with the paths below.
              </Notice>
              <ExportStatusLine
                status={exportStatuses.bundle}
                idleMessage="Bundle ready · workflow, JUnit, PR, intake, and trace card"
              />
              <div
                className="mobile-proof-summary mobile-ship-proof"
                data-testid="mobile-ship-proof"
              >
                <span>
                  <strong>5</strong> artifacts
                </span>
                <span>Workflow</span>
                <span>JUnit</span>
                <span>PR report</span>
                <span>Intake</span>
                <span>Trace card</span>
              </div>
              <Panel title="Export target" caption="CLI runtime">
                <Field
                  label="Current runtime input path"
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
                {exportArtifactDefinitions
                  .filter((definition) => definition.kind !== "trace-card")
                  .map((definition) => (
                    <ExportCard
                      key={definition.kind}
                      title={definition.title}
                      caption={definition.caption}
                      value={exportBundle[definition.bundleKey]}
                      kind={definition.kind}
                      inputRequirement={definition.inputRequirement}
                      status={exportStatuses[definition.kind]}
                      onExport={() => void exportArtifact(definition.kind)}
                    />
                  ))}
              </div>
            </Section>
          )}

          {state.activeSurface === "settings" && (
            <Section
              eyebrow="Workspace configuration"
              title="Settings"
              description="Manage models, local credentials, privacy, sandbox, updates, and telemetry."
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
                    runtime.osKeychain
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
                    description="Consent preference only in this build. Redacted events stay local because no uploader is installed."
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
                    description={
                      runtime.localProcesses
                        ? "Containerized exec with denied network egress by default."
                        : "Unavailable in the browser runtime."
                    }
                    checked={runtime.localProcesses}
                    onChange={() => undefined}
                  />
                  <ToggleRow
                    label="Verify signed update manifests"
                    description={
                      runtime.tauri
                        ? "Reject unsigned releases. Reads from the AuraOne update channel."
                        : "Desktop updates are unavailable in the browser runtime."
                    }
                    checked={runtime.tauri}
                    onChange={() => undefined}
                  />
                  <div className="update-row" role="status" aria-live="polite">
                    <div>
                      <strong>
                        {runtime.tauri
                          ? "Desktop release channel"
                          : "Desktop updates unavailable"}
                      </strong>
                      <span>
                        {updateChecking
                          ? "Checking signed release metadata..."
                          : updateResult?.status === "current"
                            ? `Agent Studio Open ${appVersion} is current.`
                            : updateResult?.status === "available"
                              ? `Signed version ${updateResult.version} is available. ${updateResult.notes}`
                              : updateResult?.status === "unavailable" ||
                                  updateResult?.status === "error"
                                ? updateResult.reason
                                : `${updateChannel} channel, signed manifests required.`}
                      </span>
                    </div>
                    <button
                      className="secondary-button compact"
                      disabled={updateChecking}
                      onClick={async () => {
                        setUpdateChecking(true);
                        setUpdateResult(await checkForAgentStudioUpdate());
                        setUpdateChecking(false);
                      }}
                    >
                      <RefreshCw
                        aria-hidden="true"
                        size={13}
                        className={updateChecking ? "spin" : undefined}
                      />
                      Check for updates
                    </button>
                  </div>
                  <StatusPill
                    tone="success"
                    dot
                    label={`MIT licensed · v${appVersion}`}
                  />
                </Panel>
                <Panel title="Intake signing" caption={installKeyStatus}>
                  <button
                    className="secondary-button compact"
                    disabled={!runtime.intakeSigning}
                    onClick={() => void ensureInstallKeypair()}
                  >
                    <Shield aria-hidden="true" size={13} />
                    {runtime.intakeSigning
                      ? "Ensure install key"
                      : "Desktop only"}
                  </button>
                  <Notice tone="info">
                    {runtime.intakeSigning
                      ? "AuraOne intake exports reuse the shared platform keychain scope for the local Ed25519 install keypair."
                      : "Browser mode cannot access the OS keychain and never generates or persists an intake signing key."}
                  </Notice>
                </Panel>
                <div className="settings-telemetry-stack">
                  <div className="settings-telemetry-summary">
                    <strong>Telemetry event log</strong>
                    <div className="settings-telemetry-status">
                      <StatusPill
                        tone={telemetryOptIn ? "success" : "neutral"}
                        label={
                          telemetryOptIn
                            ? "Local preview"
                            : "Recording locally"
                        }
                      />
                      <StatusPill tone="neutral" label="Not sent" />
                    </div>
                  </div>
                  {telemetryEntries.length ? (
                    <>
                      <AuraTelemetryEventLog
                        events={toAuraTelemetryEvents(telemetryEntries)}
                      />
                      <pre
                        aria-label="Telemetry event log JSON"
                        className="code-block"
                      >
                        {JSON.stringify(localTelemetryEntries, null, 2)}
                      </pre>
                    </>
                  ) : (
                    <EmptyState
                      icon={Activity}
                      title="No local telemetry events"
                      body="Use an audited protocol surface to record a redacted local preview. This build does not send events."
                    />
                  )}
                </div>
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

      <nav
        className="mobile-nav"
        aria-label="Agent Studio mobile navigation"
      >
        {mobilePrimarySurfaces.map((surfaceId) => {
          const surface = surfaces.find((item) => item.id === surfaceId);
          const Icon = surfaceIcons[surfaceId];
          const isActive = state.activeSurface === surfaceId;
          return (
            <button
              key={surfaceId}
              className={isActive ? "active" : undefined}
              data-surface={surfaceId}
              aria-label={`Open ${surface?.label ?? surfaceId} workspace`}
              aria-current={isActive ? "page" : undefined}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  activeSurface: surfaceId,
                }))
              }
            >
              <Icon aria-hidden="true" size={18} />
              <span>{surface?.label}</span>
            </button>
          );
        })}
        <button
          className={
            mobilePrimarySurfaces.includes(state.activeSurface)
              ? undefined
              : "active"
          }
          aria-label="More workspace tools"
          aria-current={
            mobilePrimarySurfaces.includes(state.activeSurface)
              ? undefined
              : "page"
          }
          onClick={() =>
            setState((current) => ({ ...current, commandPaletteOpen: true }))
          }
        >
          <MoreHorizontal aria-hidden="true" size={18} />
          <span>More</span>
        </button>
      </nav>

      {state.commandPaletteOpen && (
        <ModalDialog
          labelledBy="command-palette-title"
          panelClassName="command-palette"
          onClose={() =>
            setState((current) => ({
              ...current,
              commandPaletteOpen: false,
            }))
          }
        >
          <h2 className="sr-only" id="command-palette-title">
            Workspace commands
          </h2>
          <div className="command-input">
            <Search aria-hidden="true" size={15} />
            <input
              data-modal-initial-focus
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
                  data-surface={command.surface}
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
        </ModalDialog>
      )}

      {traceCardModalOpen && (
        <ModalDialog
          labelledBy="trace-card-export-title"
          panelClassName="export-modal"
          onClose={() => setTraceCardModalOpen(false)}
        >
          <div className="modal-heading">
            <div>
              <span>Trace card export</span>
              <strong id="trace-card-export-title">
                {selectedTrace.name}
              </strong>
            </div>
            <button
              className="icon-button"
              data-modal-initial-focus
              aria-label="Close trace card export"
              onClick={() => setTraceCardModalOpen(false)}
            >
              <XCircle aria-hidden="true" size={15} />
            </button>
          </div>
          <TraceSummary trace={selectedTrace} />
          <CodeBlock value={exportBundle.traceCard} label="trace-card.json" />
          <ExportStatusLine
            status={exportStatuses["trace-card"]}
            idleMessage="Ready for local download or desktop trace-card export"
          />
          <div className="button-row right">
            <button
              className="ghost-button"
              onClick={() => setTraceCardModalOpen(false)}
            >
              Close
            </button>
            <button
              className="primary-button"
              disabled={exportStatuses["trace-card"]?.state === "running"}
              onClick={() => void exportArtifact("trace-card")}
            >
              <Download aria-hidden="true" size={14} />
              Export trace card
            </button>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}

function ModalDialog({
  labelledBy,
  panelClassName,
  onClose,
  children,
}: {
  labelledBy: string;
  panelClassName: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const focusableElements = () => {
    if (!dialogRef.current) return [];
    return Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        [
          "button:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          "a[href]",
          "[tabindex]:not([tabindex='-1'])",
        ].join(","),
      ),
    ).filter(
      (element) =>
        !element.hasAttribute("hidden") &&
        getComputedStyle(element).visibility !== "hidden",
    );
  };

  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      const initial =
        dialogRef.current?.querySelector<HTMLElement>(
          "[data-modal-initial-focus]",
        ) ??
        focusableElements()[0] ??
        dialogRef.current;
      initial?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      const restoreTarget = restoreFocusRef.current;
      window.setTimeout(() => restoreTarget?.focus(), 0);
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
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
        <Stat label="Tools" value={String(manifest.tools.length)} numeric />
        <Stat label="Resources" value={String(manifest.resources.length)} numeric />
        <Stat label="Prompts" value={String(manifest.prompts.length)} numeric />
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
  const selected =
    props.sessions.find((session) => session.id === props.selectedTraceId) ??
    props.sessions[0] ??
    emptyTrace;

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
                    ? "trace-session-row active"
                    : "trace-session-row"
                }
                onClick={() => props.onSelect(session.id)}
              >
                <span className="trace-session-main">
                  <strong>{session.name}</strong>
                  <code>{session.model}</code>
                </span>
                <span className="trace-session-metric">
                  <span>Time</span>
                  <strong>{session.createdAt.slice(11, 19)}</strong>
                </span>
                <span className="trace-session-metric">
                  <span>Duration</span>
                  <strong>{summary.latencyMs} ms</strong>
                </span>
                <span className="trace-session-metric">
                  <span>Cost</span>
                  <strong>${summary.costUsd.toFixed(4)}</strong>
                </span>
                <span className="trace-session-status">
                  <span className="trace-session-status-label">Status</span>
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
                </span>
              </button>
            );
          }}
        />
      </Panel>
      <Panel
        title="Session detail"
        caption={selected.id}
      >
        <div className="trace-detail-summary">
          <div>
            <span>Session</span>
            <strong>{selected.name}</strong>
          </div>
          <div>
            <span>Model</span>
            <code>{selected.model}</code>
          </div>
          <div>
            <span>Started</span>
            <code>{selected.createdAt.slice(11, 19)} UTC</code>
          </div>
          <div>
            <span>Events</span>
            <strong>{selected.events.length}</strong>
          </div>
        </div>
        <Timeline events={selected.events} />
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
    "No traces in Data network",
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
  const kindLabel = event.kind.replace("-", " ");
  return (
    <Component className={`timeline-row timeline-${event.kind}`}>
      <span className="timeline-rail" aria-hidden="true">
        <span className={`timeline-dot ${event.kind}`} />
      </span>
      <div className="timeline-content">
        <div className="timeline-head">
          <span className={`event-kind event-kind-${event.kind}`}>
            {kindLabel}
          </span>
          <time>{event.timestamp}</time>
        </div>
        <strong className="timeline-title">{event.title}</strong>
        <p className={event.kind.includes("tool") ? "technical" : undefined}>
          {event.body}
        </p>
        <div className="timeline-meta">
          <span>latency {event.latencyMs ? `${event.latencyMs} ms` : "—"}</span>
          <span>
            cost {event.costUsd ? `$${event.costUsd.toFixed(4)}` : "—"}
          </span>
          <span>event {event.id}</span>
        </div>
      </div>
    </Component>
  );
}

export function DiffView({ result }: { result: unknown }) {
  if (!result) {
    return (
      <EmptyState
        icon={GitCompare}
        title="No replay result"
        body="Run replay with real replay and assertion files to render the diff output."
      />
    );
  }
  const replay = result as {
    runId?: string;
    status?: string;
    durationMs?: number;
    assertions?: { passed: number; review: number; failed: number };
    changes?: Array<{
      turn: number;
      kind: string;
      label: string;
      baseline: string;
      candidate: string;
      verdict: string;
    }>;
  };
  if (Array.isArray(replay.changes)) {
    return (
      <div className="replay-evidence" data-testid="replay-evidence">
        <div className="evidence-summary">
          <div>
            <span>Run</span>
            <code>{replay.runId}</code>
          </div>
          <div>
            <span>Duration</span>
            <strong>{replay.durationMs} ms</strong>
          </div>
          <div>
            <span>Assertions</span>
            <strong>{replay.assertions?.passed} passed</strong>
          </div>
          <StatusPill
            tone={
              replay.status === "passed"
                ? "success"
                : replay.status === "failed"
                  ? "danger"
                  : "warning"
            }
            label={replay.status ?? "review"}
          />
        </div>
        <div className="diff-events">
          {replay.changes.map((change) => (
            <article className="diff-event" key={`${change.turn}-${change.kind}`}>
              <header>
                <span>
                  Turn {change.turn} · {change.kind}
                </span>
                <StatusPill
                  tone={change.verdict === "review" ? "warning" : "success"}
                  label={change.verdict}
                />
              </header>
              <strong>{change.label}</strong>
              <div className="diff-pair">
                <div>
                  <span>Baseline</span>
                  <code
                    tabIndex={0}
                    aria-label={`Baseline evidence for ${change.label}`}
                  >
                    {change.baseline}
                  </code>
                </div>
                <div>
                  <span>Candidate</span>
                  <code
                    tabIndex={0}
                    aria-label={`Candidate evidence for ${change.label}`}
                  >
                    {change.candidate}
                  </code>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
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

export function CompareMatrix({
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
  const comparison = result as {
    runId?: string;
    durationMs?: number;
    columns?: string[];
    rows?: Array<{
      label: string;
      values: Array<{ verdict: string; detail: string }>;
    }>;
    summary?: Array<{
      model: string;
      passed: number;
      review: number;
      failed: number;
      latencyMs: number;
      costUsd: number;
    }>;
  };
  if (Array.isArray(comparison.rows) && Array.isArray(comparison.columns)) {
    return (
      <div className="comparison-evidence" data-testid="comparison-evidence">
        <div className="comparison-run">
          <span>Run <code>{comparison.runId}</code></span>
          <span>{comparison.durationMs} ms</span>
        </div>
        <div
          className="comparison-table"
          style={{
            gridTemplateColumns: `minmax(132px, .8fr) repeat(${comparison.columns.length}, minmax(150px, 1fr))`,
          }}
        >
          <div className="comparison-head">Check</div>
          {comparison.columns.map((model) => (
            <div className="comparison-head" key={model}>
              <code>{model}</code>
            </div>
          ))}
          {comparison.rows.map((row) => (
            <Fragment key={row.label}>
              <div className="comparison-label">{row.label}</div>
              {row.values.map((value, index) => (
                <div
                  className={`comparison-cell comparison-${value.verdict}`}
                  key={`${row.label}-${comparison.columns?.[index]}`}
                >
                  <span className="matrix-dot" aria-hidden="true" />
                  <span>
                    <strong>{value.verdict}</strong>
                    <small>{value.detail}</small>
                  </span>
                </div>
              ))}
            </Fragment>
          ))}
        </div>
        <div className="comparison-mobile-cards" aria-label="Model comparison results">
          {comparison.rows.map((row) => (
            <article key={row.label}>
              <strong>{row.label}</strong>
              {row.values.map((value, index) => (
                <div key={`${row.label}-mobile-${comparison.columns?.[index]}`}>
                  <code>{comparison.columns?.[index]}</code>
                  <span className={`comparison-verdict comparison-${value.verdict}`}>
                    <span className="matrix-dot" aria-hidden="true" />
                    <strong>{value.verdict}</strong>
                  </span>
                  <small>{value.detail}</small>
                </div>
              ))}
            </article>
          ))}
        </div>
        <div className="model-results">
          {comparison.summary?.map((item) => (
            <div key={item.model}>
              <code>{item.model}</code>
              <span>{item.passed} pass · {item.review} review</span>
              <span>{item.latencyMs} ms · ${item.costUsd.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
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
  kind,
  inputRequirement,
  status,
  onExport,
}: {
  title: string;
  caption: string;
  value: string;
  kind: ArtifactExportKind;
  inputRequirement: string;
  status?: ExportOperationStatus;
  onExport: () => void;
}) {
  return (
    <Panel title={title} caption={caption}>
      <CodeBlock value={value} label={caption} />
      <ExportStatusLine
        status={status}
        idleMessage={`Runtime input · ${inputRequirement}`}
      />
      <div className="button-row right">
        <button
          className="ghost-button"
          onClick={() => void navigator.clipboard?.writeText(value)}
        >
          <Copy aria-hidden="true" size={13} />
          Copy
        </button>
        <button
          className="secondary-button"
          aria-label={`Export ${title}`}
          data-export-kind={kind}
          disabled={status?.state === "running"}
          onClick={onExport}
        >
          <Download aria-hidden="true" size={13} />
          Export
        </button>
      </div>
    </Panel>
  );
}

function ExportStatusLine({
  status,
  idleMessage,
}: {
  status?: ExportOperationStatus;
  idleMessage: string;
}) {
  const resolved = status ?? { state: "idle" as const, message: idleMessage };
  const Icon =
    resolved.state === "success"
      ? CheckCircle2
      : resolved.state === "error"
        ? AlertTriangle
        : resolved.state === "running"
          ? RefreshCw
          : CircleDashed;
  return (
    <div
      className={`export-operation export-operation-${resolved.state}`}
      role={resolved.state === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon
        aria-hidden="true"
        className={resolved.state === "running" ? "spin" : undefined}
        size={14}
      />
      <span>{resolved.message}</span>
    </div>
  );
}

function TraceSummary({ trace }: { trace: TraceSession }) {
  const summary = summarizeSession(trace);
  return (
    <div className="stats-row">
      <Stat label="Trace" value={trace.name} />
      <Stat label="Model" value={trace.model} mono />
      <Stat label="Tool calls" value={String(summary.toolCalls)} numeric />
      <Stat label="Latency" value={`${summary.latencyMs} ms`} mono />
      <Stat label="Cost" value={`$${summary.costUsd.toFixed(4)}`} numeric />
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
  numeric,
}: {
  label: string;
  value: string;
  mono?: boolean;
  numeric?: boolean;
}) {
  const valueClassName = [
    mono ? "mono" : "",
    numeric ? "numeric" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={valueClassName || undefined}>{value}</strong>
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
