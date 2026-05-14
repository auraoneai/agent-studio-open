export type Edition = "desktop" | "browser";

export type Transport = "stdio" | "sse" | "http" | "websocket";

export type Surface =
  | "connect"
  | "compose"
  | "traces"
  | "replay"
  | "a2a"
  | "observe"
  | "compare"
  | "ship"
  | "settings";

export type Theme = "dark" | "light" | "contrast";

export type ModelVendor = "anthropic" | "openai" | "google" | "local" | "custom";

export type ProviderKeyStatus = "none" | "saved" | "verified" | "error";

export interface ModelPreset {
  id: string;
  label: string;
  vendor: ModelVendor;
  verified: boolean;
  description: string;
  contextWindow: string;
}

export interface ProviderKeyState {
  vendor: ModelVendor;
  status: ProviderKeyStatus;
  hint: string;
  lastVerifiedAt: string | null;
}

export interface Capability {
  id: string;
  label: string;
  desktop: boolean;
  browser: boolean;
  reason?: string;
}

export interface ConnectionDraft {
  name: string;
  transport: Transport;
  command: string;
  args: string;
  cwd: string;
  url: string;
  headers: string;
}

export interface RiskFinding {
  id: string;
  severity: "pass" | "warn" | "fail";
  message: string;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: RiskFinding[];
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  mimeType: string;
}

export interface PromptDefinition {
  name: string;
  description: string;
}

export interface Manifest {
  serverName: string;
  version: string;
  tools: ToolDefinition[];
  resources: ResourceDefinition[];
  prompts: PromptDefinition[];
}

export type TimelineKind =
  | "user"
  | "model"
  | "tool-call"
  | "tool-result"
  | "replay"
  | "error";

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  title: string;
  body: string;
  timestamp: string;
  latencyMs?: number;
  costUsd?: number;
}

export interface TraceSession {
  id: string;
  name: string;
  model: string;
  status: "passed" | "failed" | "warning";
  createdAt: string;
  tags: string[];
  events: TimelineEvent[];
}

export interface A2ATestResult {
  id: string;
  name: string;
  status: "pass" | "fail" | "running";
  detail: string;
}

export interface Span {
  id: string;
  name: string;
  kind: "llm" | "tool" | "retrieval" | "custom";
  startMs: number;
  durationMs: number;
  status: "ok" | "error";
}

export interface ExportBundle {
  workflow: string;
  junit: string;
  prComment: string;
  intakeManifest: string;
  traceCard: string;
}

export interface StudioState {
  edition: Edition;
  activeSurface: Surface;
  theme: Theme;
  commandPaletteOpen: boolean;
  firstRunOpen: boolean;
  recording: boolean;
  loadingOperation: string | null;
  errorMessage: string | null;
  selectedToolName: string;
  selectedTraceId: string;
  selectedModels: string[];
  customModelId: string;
  providerKeys: Record<ModelVendor, ProviderKeyState>;
  search: string;
}
