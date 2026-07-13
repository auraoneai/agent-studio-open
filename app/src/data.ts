import type {
  A2ATestResult,
  Capability,
  ComparisonEvidence,
  ExportBundle,
  Manifest,
  ModelPreset,
  ModelVendor,
  ProviderKeyState,
  ReplayEvidence,
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

export const surfaces: Array<{ id: Surface; label: string; shortcut: string; group: "work" | "observe" | "release" }> = [
  { id: "connect", label: "Connect", shortcut: "1", group: "work" },
  { id: "compose", label: "Compose", shortcut: "2", group: "work" },
  { id: "traces", label: "Traces", shortcut: "3", group: "observe" },
  { id: "replay", label: "Replay", shortcut: "4", group: "observe" },
  { id: "a2a", label: "A2A", shortcut: "5", group: "observe" },
  { id: "observe", label: "Data network", shortcut: "6", group: "observe" },
  { id: "compare", label: "Compare", shortcut: "7", group: "release" },
  { id: "ship", label: "Ship", shortcut: "8", group: "release" },
  { id: "settings", label: "Settings", shortcut: ",", group: "release" },
];

export const modelPresets: ModelPreset[] = [
  {
    id: "claude-opus-4-7",
    label: "claude-opus-4-7",
    vendor: "anthropic",
    verified: true,
    description: "Anthropic frontier model, 1M-context.",
    contextWindow: "1M ctx",
  },
  {
    id: "gpt-5.5",
    label: "gpt-5.5",
    vendor: "openai",
    verified: true,
    description: "OpenAI flagship, tool-use tuned.",
    contextWindow: "400K ctx",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "gemini-3.1-pro-preview",
    vendor: "google",
    verified: true,
    description: "Google preview, long-context reasoning.",
    contextWindow: "2M ctx",
  },
  {
    id: "llama-4-local",
    label: "llama-4-local",
    vendor: "local",
    verified: true,
    description: "Local Ollama / llama.cpp endpoint.",
    contextWindow: "128K ctx",
  },
];

export const models = modelPresets.map((preset) => preset.id);

export const vendorLabels: Record<ModelVendor, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  local: "Local",
  custom: "Custom",
};

export const initialProviderKeys: Record<ModelVendor, ProviderKeyState> = {
  anthropic: { vendor: "anthropic", status: "none", hint: "", lastVerifiedAt: null },
  openai: { vendor: "openai", status: "none", hint: "", lastVerifiedAt: null },
  google: { vendor: "google", status: "none", hint: "", lastVerifiedAt: null },
  local: { vendor: "local", status: "none", hint: "", lastVerifiedAt: null },
  custom: { vendor: "custom", status: "none", hint: "", lastVerifiedAt: null },
};

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
    model: "claude-opus-4-7",
    status: "passed",
    createdAt: "2026-05-12T09:41:09Z",
    tags: ["refund", "mcp", "regression"],
    events: sampleEvents,
  },
  {
    id: "trace-rate-limit",
    name: "429 retry handling",
    model: "gpt-5.5",
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
    model: "gemini-3.1-pro-preview",
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

export const demoReplayResult: ReplayEvidence = {
  runId: "replay-2026-05-12-094118",
  status: "review",
  baseline: "trace-refund",
  candidate: "support-crm-mcp@0.8.4",
  durationMs: 1842,
  assertions: { passed: 7, review: 1, failed: 0 },
  changes: [
    {
      turn: 3,
      kind: "tool-input",
      label: "lookup_order arguments",
      baseline: '{"order_id":"ORD-1842","include_events":true}',
      candidate: '{"include_events":true,"order_id":"ORD-1842"}',
      verdict: "equivalent",
    },
    {
      turn: 5,
      kind: "tool-output",
      label: "refund_order response",
      baseline: '{"status":"approved","amount_cents":1299}',
      candidate: '{"amount_cents":1299,"status":"approved","retry_count":1}',
      verdict: "review",
    },
    {
      turn: 6,
      kind: "model-output",
      label: "Final response",
      baseline: "Refund confirmed. Notification sent.",
      candidate: "Refund confirmed and the customer notification was sent.",
      verdict: "equivalent",
    },
  ],
};

export const demoCompareResult: ComparisonEvidence = {
  runId: "compare-2026-05-12-094203",
  baseline: "trace-refund",
  durationMs: 3264,
  columns: ["claude-opus-4-7", "gpt-5.5"],
  rows: [
    {
      label: "Tool sequence",
      values: [
        { verdict: "pass", detail: "2 calls · exact" },
        { verdict: "pass", detail: "2 calls · exact" },
      ],
    },
    {
      label: "Arguments",
      values: [
        { verdict: "pass", detail: "schema exact" },
        { verdict: "review", detail: "key order only" },
      ],
    },
    {
      label: "Policy decision",
      values: [
        { verdict: "pass", detail: "refund approved" },
        { verdict: "pass", detail: "refund approved" },
      ],
    },
    {
      label: "Retry behavior",
      values: [
        { verdict: "pass", detail: "0 retries" },
        { verdict: "review", detail: "1 retry" },
      ],
    },
    {
      label: "Final response",
      values: [
        { verdict: "pass", detail: "grounded" },
        { verdict: "pass", detail: "paraphrase" },
      ],
    },
  ],
  summary: [
    { model: "claude-opus-4-7", passed: 5, review: 0, failed: 0, latencyMs: 1796, costUsd: 0.0073 },
    { model: "gpt-5.5", passed: 3, review: 2, failed: 0, latencyMs: 2342, costUsd: 0.0107 },
  ],
};

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
  const selected = sessions[0];
  const tools =
    selected?.events
      .filter((event) => event.kind === "tool-call")
      .map((event) => event.title) ?? [];
  const finalAnswer =
    [...(selected?.events ?? [])]
      .reverse()
      .find((event) => event.kind === "model")?.body ?? "";
  const replayEvents: Array<{
    type: string;
    tool_name: string;
    arguments?: unknown;
    output?: unknown;
  }> =
    selected?.events.flatMap<{
      type: string;
      tool_name: string;
      arguments?: unknown;
      output?: unknown;
    }>((event) => {
      if (event.kind === "tool-call") {
        return [
          {
            type: "tool_call",
            tool_name: event.title,
            arguments: parseExportValue(event.body),
          },
        ];
      }
      if (event.kind === "tool-result") {
        return [
          {
            type: "tool_result",
            tool_name: event.title.replace(/\s+result$/i, ""),
            output: parseExportValue(event.body),
          },
        ];
      }
      return [];
    }) ?? [];
  const replay = {
    schema_version: "tool-call-replay/v1",
    trace_id: selected?.id ?? "trace-empty",
    goal: selected?.name ?? "No trace selected",
    events: replayEvents,
    final_answer: finalAnswer,
  };
  const traceCard = {
    schema_version: "agent-trace-card/v1",
    trace_id: selected?.id ?? "trace-empty",
    goal: selected?.name ?? "No trace selected",
    outcome: selected?.status === "failed" ? "failed" : "passed",
    tools: [...new Set(tools)].sort(),
    retry_count: tools.reduce(
      (count, tool, index) =>
        count + (tools.slice(0, index).includes(tool) ? 1 : 0),
      0,
    ),
    data_touched: exportDataTouched(selected),
    policy_checks: [],
    failure_modes:
      selected?.events.some((event) => event.kind === "error")
        ? ["tool_error"]
        : [],
    human_intervention: "none recorded",
    regression_status: "covered",
    links: {},
  };
  const junitCases = sessions
    .map((session) => {
      const name = escapeExportXml(session.name);
      if (session.status === "passed") {
        return `<testcase name="${name}" />`;
      }
      return `<testcase name="${name}"><failure>${escapeExportXml(
        session.status === "failed"
          ? "trace failed"
          : "trace requires review",
      )}</failure></testcase>`;
    })
    .join("");
  return {
    workflow: `name: Agent regression
on: [pull_request]
jobs:
  agent-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install tool-call-replay
      - run: |
          for f in regressions/*.json; do
            tool-call-replay run "$f" --assert "\${f%.json}.assertions.yaml" || exit 1
          done
`,
    junit: `<testsuite name="agentstudio" tests="${sessions.length}" failures="${sessions.filter((session) => session.status !== "passed").length}">${junitCases}</testsuite>\n`,
    prComment: [
      "<!-- agentstudio-trace-card -->",
      "## Agent Studio Trace",
      "",
      `- Session: \`${selected?.id ?? "trace-empty"}\``,
      `- Tool calls: ${tools.length}`,
      "",
      ...tools.map(
        (tool, index) => `${index + 1}. \`${tool}\` status: \`ok\``,
      ),
      "",
    ].join("\n"),
    intakeManifest: JSON.stringify(
      {
        schema: "agentstudio.export-evidence.v1",
        archive: "agentstudio-intake.zip",
        entries: [
          "trace.ast",
          `regressions/${selected?.id ?? "trace-empty"}.json`,
          `regressions/${selected?.id ?? "trace-empty"}.assertions.yaml`,
          "README.md",
          "agentstudio-export-manifest.json",
        ],
      },
      null,
      2,
    ),
    traceCard: `${JSON.stringify(traceCard, null, 2)}\n`,
    sourceTrace: `${JSON.stringify(
      {
        schema: "agentstudio.trace-export.v1",
        trace: selected ?? null,
      },
      null,
      2,
    )}\n`,
    regressionReplay: `${JSON.stringify(replay, null, 2)}\n`,
    regressionAssertions: [
      "tool_order:",
      ...(tools.length > 0
        ? tools.map((tool) => `  - ${tool}`)
        : ["  []"]),
      `final_answer_contains: ${JSON.stringify(
        finalAnswer.split(/\s+/).slice(0, 2).join(" ") || "completed",
      )}`,
      "",
    ].join("\n"),
    regressionReadme:
      "# Agent Studio regression export\n\nRun by GitHub Actions with `tool-call-replay`.\n",
    intakeReadme:
      "Agent Studio Open intake packet. User-created local export.\n",
  };
}

function parseExportValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function escapeExportXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function exportDataTouched(session: TraceSession | undefined): string[] {
  const values = new Set<string>();
  for (const event of session?.events ?? []) {
    if (event.kind !== "tool-call") {
      continue;
    }
    const payload = parseExportValue(event.body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      continue;
    }
    const record = payload as Record<string, unknown>;
    for (const key of [
      "order_id",
      "user_id",
      "account_id",
      "ticket_id",
      "file_path",
    ]) {
      if (key in record) {
        values.add(`${key}:${String(record[key])}`);
      }
    }
  }
  return [...values].sort();
}
