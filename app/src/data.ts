import type {
  A2ATestResult,
  Capability,
  ExportBundle,
  Manifest,
  Span,
  Surface,
  TimelineEvent,
  ToolDefinition,
  TraceSession,
} from "./types";

export const capabilities: Capability[] = [
  {
    id: "stdio",
    label: "MCP stdio transport",
    desktop: true,
    browser: false,
    reason: "Browsers cannot spawn local processes.",
  },
  { id: "sse", label: "MCP SSE transport", desktop: true, browser: true },
  { id: "http", label: "MCP JSON-RPC over HTTP", desktop: true, browser: true },
  { id: "websocket", label: "MCP WebSocket transport", desktop: true, browser: true },
  {
    id: "otlp-receiver",
    label: "Local OTLP receiver",
    desktop: true,
    browser: false,
    reason: "Browsers cannot bind localhost listeners.",
  },
  { id: "a2a", label: "A2A card testing", desktop: true, browser: true },
  { id: "indexeddb", label: "IndexedDB trace storage", desktop: false, browser: true },
  { id: "keychain", label: "OS keychain provider secrets", desktop: true, browser: false },
  { id: "passphrase", label: "Passphrase-protected browser secrets", desktop: false, browser: true },
];

export const surfaces: Array<{ id: Surface; label: string; shortcut: string }> = [
  { id: "connect", label: "Connect", shortcut: "1" },
  { id: "compose", label: "Compose", shortcut: "2" },
  { id: "traces", label: "Traces", shortcut: "3" },
  { id: "replay", label: "Replay", shortcut: "4" },
  { id: "a2a", label: "A2A", shortcut: "5" },
  { id: "observe", label: "Observe", shortcut: "6" },
  { id: "compare", label: "Compare", shortcut: "7" },
  { id: "ship", label: "Ship", shortcut: "8" },
  { id: "settings", label: "Settings", shortcut: "," },
];

const refundTool: ToolDefinition = {
  name: "refund_order",
  title: "Refund order",
  description: "Issues a customer refund after validating order status and policy windows.",
  inputSchema: {
    type: "object",
    required: ["order_id", "reason", "notify_customer"],
    properties: {
      order_id: { type: "string", minLength: 6 },
      reason: { type: "string", enum: ["duplicate", "damaged", "late", "support_override"] },
      amount_cents: { type: "integer", minimum: 1 },
      notify_customer: { type: "boolean" },
    },
  },
  risk: [{ id: "risk-1", severity: "warn", message: "Destructive financial action requires explicit confirmation copy." }],
};

const deleteTool: ToolDefinition = {
  name: "delete_customer",
  title: "Delete customer",
  description: "Queues a GDPR deletion job for a customer record.",
  inputSchema: {
    type: "object",
    required: ["customer_id", "confirmation"],
    properties: {
      customer_id: { type: "string" },
      confirmation: { type: "string", pattern: "^DELETE$" },
    },
  },
  risk: [
    { id: "risk-2", severity: "fail", message: "High-impact tool lacks a two-step confirmation field." },
    { id: "risk-3", severity: "warn", message: "No dry-run argument exposed." },
  ],
};

export const sampleManifest: Manifest = {
  serverName: "support-crm-mcp",
  version: "0.8.4",
  tools: [
    refundTool,
    deleteTool,
    {
      name: "lookup_order",
      title: "Lookup order",
      description: "Retrieves order details, fulfillment state, and policy metadata.",
      inputSchema: {
        type: "object",
        required: ["order_id"],
        properties: { order_id: { type: "string" }, include_events: { type: "boolean" } },
      },
      risk: [{ id: "risk-4", severity: "pass", message: "Read-only tool with bounded schema." }],
    },
  ],
  resources: [
    { uri: "crm://customers/{id}", name: "Customer record", mimeType: "application/json" },
    { uri: "orders://events/{order_id}", name: "Order event stream", mimeType: "application/jsonl" },
  ],
  prompts: [
    { name: "refund_triage", description: "Walks an agent through refund eligibility." },
    { name: "escalation_summary", description: "Creates a support handoff summary." },
  ],
};

export const sampleToolPayload = JSON.stringify(
  {
    order_id: "ORD-1842",
    reason: "late",
    amount_cents: 1299,
    notify_customer: true,
  },
  null,
  2,
);

export const sampleEvents: TimelineEvent[] = [
  {
    id: "evt-1",
    kind: "user",
    title: "User request",
    body: "Customer asks for a refund because delivery missed the SLA.",
    timestamp: "09:41:02",
  },
  {
    id: "evt-2",
    kind: "model",
    title: "Model plan",
    body: "Check order status, verify policy window, then refund if eligible.",
    timestamp: "09:41:04",
    latencyMs: 812,
    costUsd: 0.0042,
  },
  {
    id: "evt-3",
    kind: "tool-call",
    title: "lookup_order",
    body: '{ "order_id": "ORD-1842", "include_events": true }',
    timestamp: "09:41:05",
    latencyMs: 118,
  },
  {
    id: "evt-4",
    kind: "tool-result",
    title: "lookup_order result",
    body: "Delivered 3 days late; refund window still open.",
    timestamp: "09:41:06",
  },
  {
    id: "evt-5",
    kind: "tool-call",
    title: "refund_order",
    body: sampleToolPayload,
    timestamp: "09:41:08",
    latencyMs: 226,
  },
  {
    id: "evt-6",
    kind: "model",
    title: "Final response",
    body: "Confirmed refund and sent a customer notification.",
    timestamp: "09:41:09",
    latencyMs: 640,
    costUsd: 0.0031,
  },
];

export const traceSessions: TraceSession[] = [
  {
    id: "trace-refund",
    name: "Late delivery refund",
    model: "claude-sonnet-4.7",
    status: "passed",
    createdAt: "2026-05-12T09:41:09Z",
    tags: ["refund", "mcp", "regression"],
    events: sampleEvents,
  },
  {
    id: "trace-rate-limit",
    name: "429 retry handling",
    model: "gpt-5.1",
    status: "warning",
    createdAt: "2026-05-12T10:14:23Z",
    tags: ["retry", "diff"],
    events: [
      ...sampleEvents.slice(0, 4),
      {
        id: "evt-rl",
        kind: "replay",
        title: "Replay note",
        body: "New model retries once more after a 429. Marked for review.",
        timestamp: "10:14:27",
        latencyMs: 1412,
        costUsd: 0.0065,
      },
    ],
  },
  {
    id: "trace-delete",
    name: "Deletion guardrail blocked",
    model: "gemini-2.5-pro",
    status: "failed",
    createdAt: "2026-05-12T11:03:44Z",
    tags: ["safety", "a2a"],
    events: [
      ...sampleEvents.slice(0, 2),
      {
        id: "evt-error",
        kind: "error",
        title: "Sandbox rejected",
        body: "delete_customer requires explicit confirmation and dry-run review.",
        timestamp: "11:03:47",
      },
    ],
  },
];

export const a2aResults: A2ATestResult[] = [
  { id: "a2a-1", name: "Agent card required fields", status: "pass", detail: "name, url, capabilities, and auth present." },
  { id: "a2a-2", name: "Capability negotiation", status: "pass", detail: "Agent accepts structured support-ticket payloads." },
  { id: "a2a-3", name: "Task lifecycle", status: "fail", detail: "Missing cancellation terminal state in sample transcript." },
  { id: "a2a-4", name: "Error path coverage", status: "pass", detail: "Invalid payload returns machine-readable error." },
];

export const spans: Span[] = [
  { id: "span-1", name: "POST /chat/completions", kind: "llm", startMs: 0, durationMs: 820, status: "ok" },
  { id: "span-2", name: "mcp.lookup_order", kind: "tool", startMs: 870, durationMs: 155, status: "ok" },
  { id: "span-3", name: "retrieval.policy_window", kind: "retrieval", startMs: 1080, durationMs: 240, status: "ok" },
  { id: "span-4", name: "mcp.refund_order", kind: "tool", startMs: 1370, durationMs: 310, status: "error" },
];

export const models = ["claude-sonnet-4.7", "gpt-5.1", "gemini-2.5-pro", "llama-4-local"];

export function validateJson(input: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export function filterSessions(sessions: TraceSession[], search: string): TraceSession[] {
  const normalized = search.trim().toLowerCase();
  if (!normalized) {
    return sessions;
  }
  return sessions.filter((session) => {
    return [session.name, session.model, session.status, ...session.tags].some((value) =>
      value.toLowerCase().includes(normalized),
    );
  });
}

export function summarizeSession(session: TraceSession): { latencyMs: number; costUsd: number; toolCalls: number } {
  return session.events.reduce(
    (acc, event) => ({
      latencyMs: acc.latencyMs + (event.latencyMs ?? 0),
      costUsd: acc.costUsd + (event.costUsd ?? 0),
      toolCalls: acc.toolCalls + (event.kind === "tool-call" ? 1 : 0),
    }),
    { latencyMs: 0, costUsd: 0, toolCalls: 0 },
  );
}

export function buildExportBundle(sessions: TraceSession[]): ExportBundle {
  const cases = sessions.map((session) => `          tool-call-replay run regressions/${session.id}.json`).join("\n");
  return {
    workflow: [
      "name: Agent Studio Regression",
      "on: [pull_request, push]",
      "jobs:",
      "  replay:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - run: pip install tool-call-replay",
      "      - name: Run agent regressions",
      "        run: |",
      cases,
    ].join("\n"),
    junit: `<?xml version="1.0" encoding="UTF-8"?><testsuite name="agent-studio" tests="${sessions.length}" failures="1"><testcase name="Late delivery refund"/><testcase name="Deletion guardrail blocked"><failure message="sandbox rejected"/></testcase></testsuite>`,
    prComment: [
      "## Agent Studio regression report",
      "",
      "| Session | Model | Status |",
      "|---|---|---|",
      ...sessions.map((session) => `| ${session.name} | ${session.model} | ${session.status} |`),
    ].join("\n"),
    intakeManifest: JSON.stringify(
      {
        format: "auraonepkg.agent-studio.v1",
        generatedBy: "Agent Studio Open",
        redaction: "trace payload preview required before upload",
        sessions: sessions.map(({ id, name, model, status }) => ({ id, name, model, status })),
      },
      null,
      2,
    ),
    traceCard: JSON.stringify(
      {
        schema: "https://auraone.ai/schemas/agent-trace-card.v1.json",
        generatedBy: "Agent Studio Open",
        trace: {
          id: sessions[0]?.id ?? "trace-empty",
          name: sessions[0]?.name ?? "No trace selected",
          model: sessions[0]?.model ?? "unknown",
          status: sessions[0]?.status ?? "pending",
          summary: sessions[0] ? summarizeSession(sessions[0]) : { latencyMs: 0, costUsd: 0, toolCalls: 0 },
        },
        artifacts: ["workflow", "junit", "pr-comment", "auraone-intake"],
      },
      null,
      2,
    ),
  };
}
