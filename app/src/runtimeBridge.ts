import type {
  A2ATestResult,
  ConnectionDraft,
  Manifest,
  PromptDefinition,
  ResourceDefinition,
  ToolDefinition,
  Transport,
} from "./types";
import { isTauriRuntime } from "./platformBridge";

type InvokeArgs = Record<string, unknown>;

export interface SidecarHealth {
  ok: boolean;
  imports?: Record<string, boolean>;
}

export interface RuntimeCommandResult {
  ok?: boolean;
  running?: boolean;
  [key: string]: unknown;
}

export async function runtimeSidecarHealth(): Promise<SidecarHealth> {
  return invokeRuntime<SidecarHealth>("sidecar_health", {});
}

export async function runtimeMcpConnect(
  connection: ConnectionDraft,
): Promise<Manifest> {
  const args = splitArgs(connection.args);
  const payload = await invokeRuntime<Record<string, unknown>>("mcp_connect", {
    request: {
      transport: connection.transport,
      command: connection.command,
      args,
      cwd: expandHome(connection.cwd),
      url: connection.url,
    },
  });
  return manifestFromRuntime(payload, connection.name, connection.transport);
}

export async function runtimeTraceSearch(
  store: string,
  query: string,
): Promise<RuntimeCommandResult[]> {
  return invokeRuntime<RuntimeCommandResult[]>("trace_store_query", {
    request: { store, query },
  });
}

export async function runtimeTraceImport(
  trace: string,
  format: string,
  store: string,
): Promise<RuntimeCommandResult> {
  return invokeRuntime<RuntimeCommandResult>("trace_store_write", {
    request: { trace, format, store },
  });
}

export async function runtimeReplayRun(
  replay: string,
  assertions: string,
): Promise<RuntimeCommandResult> {
  return invokeRuntime<RuntimeCommandResult>("replay_run", {
    request: { replay, assertions },
  });
}

export async function runtimeCompareRun(
  baseline: string,
  candidate: string,
): Promise<RuntimeCommandResult> {
  return invokeRuntime<RuntimeCommandResult>("compare_run", {
    request: { baseline, candidate },
  });
}

export async function runtimeA2ARunContracts(
  card: unknown,
  transcript?: unknown,
): Promise<A2ATestResult[]> {
  const payload = await invokeRuntime<Record<string, unknown>>(
    "a2a_run_contracts",
    {
      request: { card, transcript },
    },
  );
  return a2aResultsFromRuntime(payload);
}

export async function runtimeOtlpReceiverToggle(
  enabled: boolean,
  store: string,
  port = 4318,
): Promise<RuntimeCommandResult> {
  return invokeRuntime<RuntimeCommandResult>("otlp_receiver_toggle", {
    request: { enabled, store, host: "127.0.0.1", port },
  });
}

export async function runtimeExportBundle(
  kind: string,
  input: string,
  out: string,
): Promise<RuntimeCommandResult> {
  return invokeRuntime<RuntimeCommandResult>("export_bundle", {
    request: { kind, input, out },
  });
}

export function runtimeUnavailableMessage(feature: string): string {
  return `${feature} requires the Tauri desktop runtime. The hosted browser edition stays read-only and uses curated public samples.`;
}

async function invokeRuntime<T>(command: string, args: InvokeArgs): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(runtimeUnavailableMessage(command));
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function manifestFromRuntime(
  payload: Record<string, unknown>,
  fallbackName: string,
  transport: Transport,
): Manifest {
  const initialize = asRecord(payload.initialize);
  const serverInfo = asRecord(initialize.serverInfo);
  const serverName = stringValue(serverInfo.name) ?? fallbackName;
  const version =
    stringValue(serverInfo.version) ??
    stringValue(initialize.protocolVersion) ??
    transport;
  return {
    serverName,
    version,
    tools: arrayValue(payload.tools).map(toolFromRuntime),
    resources: arrayValue(payload.resources).map(resourceFromRuntime),
    prompts: arrayValue(payload.prompts).map(promptFromRuntime),
  };
}

function toolFromRuntime(value: unknown): ToolDefinition {
  const item = asRecord(value);
  const name = stringValue(item.name) ?? "unnamed_tool";
  return {
    name,
    title: stringValue(item.title) ?? titleFromName(name),
    description:
      stringValue(item.description) ?? "No description supplied by server.",
    inputSchema: asRecord(item.inputSchema),
    risk: [],
  };
}

function resourceFromRuntime(value: unknown): ResourceDefinition {
  const item = asRecord(value);
  const uri =
    stringValue(item.uri) ?? stringValue(item.name) ?? "resource://unknown";
  return {
    uri,
    name: stringValue(item.name) ?? uri,
    mimeType: stringValue(item.mimeType) ?? "application/octet-stream",
  };
}

function promptFromRuntime(value: unknown): PromptDefinition {
  const item = asRecord(value);
  const name = stringValue(item.name) ?? "unnamed_prompt";
  return {
    name,
    description:
      stringValue(item.description) ?? "No description supplied by server.",
  };
}

function a2aResultsFromRuntime(
  payload: Record<string, unknown>,
): A2ATestResult[] {
  const checks = arrayValue(payload.checks);
  if (checks.length === 0) {
    return [
      {
        id: "a2a-result",
        name: "A2A contract result",
        status: payload.passed === true ? "pass" : "fail",
        detail:
          payload.passed === true
            ? "Contract passed."
            : JSON.stringify(payload),
      },
    ];
  }
  return checks.map((check, index) => {
    const item = asRecord(check);
    return {
      id: `a2a-${index + 1}`,
      name: stringValue(item.name) ?? `Check ${index + 1}`,
      status: item.passed === false ? "fail" : "pass",
      detail:
        stringValue(item.detail) ??
        stringValue(item.message) ??
        JSON.stringify(item),
    };
  });
}

function splitArgs(input: string): string[] {
  return input
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function expandHome(path: string): string {
  if (!path.startsWith("~/")) {
    return path;
  }
  return path;
}

function titleFromName(name: string): string {
  return name
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
