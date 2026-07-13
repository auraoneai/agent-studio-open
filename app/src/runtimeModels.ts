import type {
  ComparisonCell,
  ComparisonEvidence,
  ComparisonRow,
  ComparisonSummary,
  ReplayChange,
  ReplayEvidence,
  TimelineEvent,
  TimelineKind,
  TraceSession,
} from "./types";

export interface RuntimeResultEnvelope {
  payload: unknown;
  exitCode: number;
  expectedNonzero: boolean;
}

export interface TraceImportContext {
  tracePath: string;
  format: string;
  storePath: string;
  createdAt?: string;
}

export interface ReplayContext {
  replayPath: string;
  assertionsPath: string;
  durationMs?: number;
}

export interface CompareContext {
  baselinePath: string;
  candidatePath: string;
  durationMs?: number;
}

export function unwrapRuntimeResult(value: unknown): RuntimeResultEnvelope {
  const record = asRecord(value);
  const exitCode =
    numberValue(record.exitCode) ?? numberValue(record.exit_code);
  if ("payload" in record && exitCode !== undefined) {
    return {
      payload: record.payload,
      exitCode,
      expectedNonzero:
        record.expectedNonzero === true ||
        record.expected_nonzero === true ||
        exitCode !== 0,
    };
  }
  return {
    payload: value,
    exitCode: 0,
    expectedNonzero: false,
  };
}

export function normalizeTraceImportResult(
  value: unknown,
  context: TraceImportContext,
): TraceSession {
  const { payload } = unwrapRuntimeResult(value);
  const record = asRecord(payload);
  const trace = asRecord(record.trace ?? record.replay ?? record.case);
  const sessionId =
    stringValue(record.session_id) ??
    stringValue(record.sessionId) ??
    stringValue(trace.trace_id) ??
    stringValue(trace.traceId) ??
    runtimeId("trace", `${context.storePath}:${context.tracePath}`);
  const rawEvents = arrayValue(trace.events);
  const finalAnswer =
    stringValue(trace.final_answer) ??
    stringValue(trace.finalAnswer) ??
    stringValue(record.final_answer) ??
    stringValue(record.finalAnswer);
  const events: TimelineEvent[] =
    rawEvents.length > 0
      ? rawEvents.map((event, index) =>
          timelineEventFromRuntime(event, sessionId, index),
        )
      : [
          {
            id: `${sessionId}-import`,
            kind: "replay" as const,
            title: "Trace imported",
            body: `${context.tracePath} -> ${context.storePath}`,
            timestamp: "00:00:00",
          },
        ];
  const hasFinalAnswerEvent = rawEvents.some((event) => {
    const item = asRecord(event);
    return (
      stringValue(item.type)?.replaceAll("-", "_") === "final_answer" ||
      stringValue(item.kind)?.replaceAll("-", "_") === "final_answer"
    );
  });
  if (finalAnswer && !hasFinalAnswerEvent) {
    events.push(
      timelineEventFromRuntime(
        { type: "final_answer", output: finalAnswer },
        sessionId,
        events.length,
      ),
    );
  }
  const hasError = rawEvents.some((event) => {
    const item = asRecord(event);
    return Boolean(item.error) || stringValue(item.status) === "error";
  });

  return {
    id: sessionId,
    name:
      stringValue(trace.goal) ??
      stringValue(record.name) ??
      `Imported ${context.format}`,
    model:
      stringValue(trace.model) ??
      stringValue(record.model) ??
      "runtime import",
    status: hasError ? "failed" : "passed",
    createdAt:
      stringValue(record.importedAt) ??
      stringValue(record.imported_at) ??
      context.createdAt ??
      new Date().toISOString(),
    tags: ["imported", context.format],
    events,
  };
}

export function normalizeReplayResult(
  value: unknown,
  context: ReplayContext,
): ReplayEvidence {
  const envelope = unwrapRuntimeResult(value);
  const record = asRecord(envelope.payload);
  if (Array.isArray(record.changes)) {
    return {
      runId:
        stringValue(record.runId) ??
        stringValue(record.run_id) ??
        runtimeId(
          "replay",
          `${context.replayPath}:${context.assertionsPath}`,
        ),
      status: replayStatus(record.status),
      baseline: stringValue(record.baseline) ?? context.replayPath,
      candidate: stringValue(record.candidate) ?? context.assertionsPath,
      durationMs:
        numberValue(record.durationMs) ??
        numberValue(record.duration_ms) ??
        context.durationMs ??
        0,
      assertions: assertionCounts(record.assertions, record.changes),
      changes: record.changes.map(replayChangeFromRuntime),
      exitCode: envelope.exitCode,
    };
  }

  const results = Array.isArray(envelope.payload)
    ? envelope.payload
    : arrayValue(record.results ?? record.assertions);
  const changes = results.map((result, index) =>
    replayAssertionFromRuntime(result, index),
  );
  const failed = changes.filter((change) => change.verdict === "fail").length;
  const review = changes.filter(
    (change) => change.verdict === "review",
  ).length;

  return {
    runId: runtimeId(
      "replay",
      `${context.replayPath}:${context.assertionsPath}`,
    ),
    status: failed > 0 ? "failed" : review > 0 ? "review" : "passed",
    baseline: context.replayPath,
    candidate: context.assertionsPath,
    durationMs: context.durationMs ?? 0,
    assertions: {
      passed: changes.length - failed - review,
      review,
      failed,
    },
    changes:
      changes.length > 0
        ? changes
        : [
            {
              turn: 1,
              kind: "runtime",
              label: "Replay result",
              baseline: "Assertions loaded",
              candidate: stableStringify(envelope.payload),
              verdict: envelope.exitCode === 0 ? "equivalent" : "fail",
            },
          ],
    exitCode: envelope.exitCode,
  };
}

export function normalizeCompareResult(
  value: unknown,
  context: CompareContext,
): ComparisonEvidence {
  const envelope = unwrapRuntimeResult(value);
  const record = asRecord(envelope.payload);
  if (Array.isArray(record.rows) && Array.isArray(record.columns)) {
    const columns = record.columns.map((column) => String(column));
    const rows = record.rows.map(comparisonRowFromRuntime);
    return {
      runId:
        stringValue(record.runId) ??
        stringValue(record.run_id) ??
        runtimeId(
          "compare",
          `${context.baselinePath}:${context.candidatePath}`,
        ),
      durationMs:
        numberValue(record.durationMs) ??
        numberValue(record.duration_ms) ??
        context.durationMs ??
        0,
      columns,
      rows,
      summary: comparisonSummaryFromRuntime(record.summary, columns, rows),
      exitCode: envelope.exitCode,
    };
  }

  const baseline = arrayValue(record.baseline);
  const candidate = arrayValue(record.candidate);
  const differences = arrayValue(record.differences).map((item) =>
    String(item),
  );
  const columns = [
    fileLabel(context.baselinePath, "Baseline"),
    fileLabel(context.candidatePath, "Candidate"),
  ];
  const rows = comparisonRowsFromCli(
    baseline,
    candidate,
    differences,
    record.passed === true,
  );

  return {
    runId: runtimeId(
      "compare",
      `${context.baselinePath}:${context.candidatePath}`,
    ),
    durationMs: context.durationMs ?? 0,
    columns,
    rows,
    summary: buildComparisonSummary(columns, rows),
    exitCode: envelope.exitCode,
  };
}

function timelineEventFromRuntime(
  value: unknown,
  sessionId: string,
  index: number,
): TimelineEvent {
  const item = asRecord(value);
  const rawType =
    stringValue(item.type) ??
    stringValue(item.event_type) ??
    stringValue(item.kind) ??
    "event";
  const kind = timelineKind(rawType, item);
  const toolName =
    stringValue(item.tool_name) ??
    stringValue(item.toolName) ??
    stringValue(item.name);
  const output = item.error ?? item.output ?? item.arguments ?? item.content;

  return {
    id:
      stringValue(item.id) ??
      `${sessionId}-event-${String(index + 1).padStart(2, "0")}`,
    kind,
    title:
      toolName ??
      (kind === "model"
        ? "Model response"
        : kind === "user"
          ? "User message"
          : titleFromKind(kind)),
    body: output === undefined ? rawType : stableStringify(output),
    timestamp:
      stringValue(item.timestamp) ??
      `00:00:${String(index + 1).padStart(2, "0")}`,
    latencyMs:
      numberValue(item.latencyMs) ??
      numberValue(item.latency_ms) ??
      numberValue(item.latency),
    costUsd:
      numberValue(item.costUsd) ??
      numberValue(item.cost_usd) ??
      numberValue(item.cost),
  };
}

function replayAssertionFromRuntime(
  value: unknown,
  index: number,
): ReplayChange {
  const item = asRecord(value);
  const label =
    stringValue(item.name) ??
    stringValue(item.label) ??
    `Assertion ${index + 1}`;
  const detail =
    stringValue(item.detail) ??
    stringValue(item.message) ??
    stableStringify(item);
  const ok = item.ok === true || item.passed === true;
  const split = splitAssertionDetail(detail);

  return {
    turn: index + 1,
    kind: "assertion",
    label,
    baseline: split.baseline,
    candidate: split.candidate,
    verdict: ok ? "equivalent" : "fail",
  };
}

function replayChangeFromRuntime(value: unknown, index: number): ReplayChange {
  const item = asRecord(value);
  return {
    turn: numberValue(item.turn) ?? index + 1,
    kind: stringValue(item.kind) ?? "runtime",
    label: stringValue(item.label) ?? `Change ${index + 1}`,
    baseline: displayValue(item.baseline),
    candidate: displayValue(item.candidate),
    verdict: replayVerdict(item.verdict),
  };
}

function comparisonRowFromRuntime(
  value: unknown,
  index: number,
): ComparisonRow {
  const item = asRecord(value);
  return {
    label: stringValue(item.label) ?? `Check ${index + 1}`,
    values: arrayValue(item.values).map(comparisonCellFromRuntime),
  };
}

function comparisonCellFromRuntime(value: unknown): ComparisonCell {
  const item = asRecord(value);
  return {
    verdict: comparisonVerdict(item.verdict),
    detail: stringValue(item.detail) ?? stableStringify(value),
  };
}

function comparisonRowsFromCli(
  baseline: unknown[],
  candidate: unknown[],
  differences: string[],
  passed: boolean,
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const count = Math.max(baseline.length, candidate.length);
  for (let index = 0; index < count; index += 1) {
    const left = asRecord(baseline[index]);
    const right = asRecord(candidate[index]);
    const leftDetail = toolDetail(left, index);
    const rightDetail = toolDetail(right, index);
    const same = stableStringify(left) === stableStringify(right);
    rows.push({
      label: `Turn ${index + 1} · ${
        stringValue(left.tool_name) ??
        stringValue(right.tool_name) ??
        "tool call"
      }`,
      values: [
        { verdict: left.tool_name ? "pass" : "fail", detail: leftDetail },
        {
          verdict: right.tool_name ? (same ? "pass" : "review") : "fail",
          detail: rightDetail,
        },
      ],
    });
  }

  if (differences.length > 0) {
    rows.push(
      ...differences.map((difference, index) => ({
        label: `Difference ${index + 1}`,
        values: [
          { verdict: "pass" as const, detail: "Baseline contract" },
          { verdict: "review" as const, detail: difference },
        ],
      })),
    );
  }

  if (rows.length === 0) {
    rows.push({
      label: "Behavioral equivalence",
      values: [
        { verdict: "pass", detail: "No baseline tool calls" },
        {
          verdict: passed ? "pass" : "review",
          detail: passed ? "No differences detected" : "Review runtime output",
        },
      ],
    });
  }
  return rows;
}

function comparisonSummaryFromRuntime(
  value: unknown,
  columns: string[],
  rows: ComparisonRow[],
): ComparisonSummary[] {
  const raw = arrayValue(value);
  if (raw.length === 0) {
    return buildComparisonSummary(columns, rows);
  }
  return raw.map((summary, index) => {
    const item = asRecord(summary);
    return {
      model: stringValue(item.model) ?? columns[index] ?? `Result ${index + 1}`,
      passed: numberValue(item.passed) ?? 0,
      review: numberValue(item.review) ?? 0,
      failed: numberValue(item.failed) ?? 0,
      latencyMs:
        numberValue(item.latencyMs) ?? numberValue(item.latency_ms) ?? 0,
      costUsd: numberValue(item.costUsd) ?? numberValue(item.cost_usd) ?? 0,
    };
  });
}

function buildComparisonSummary(
  columns: string[],
  rows: ComparisonRow[],
): ComparisonSummary[] {
  return columns.map((column, columnIndex) => {
    const cells = rows
      .map((row) => row.values[columnIndex])
      .filter((cell): cell is ComparisonCell => Boolean(cell));
    return {
      model: column,
      passed: cells.filter((cell) => cell.verdict === "pass").length,
      review: cells.filter((cell) => cell.verdict === "review").length,
      failed: cells.filter((cell) => cell.verdict === "fail").length,
      latencyMs: 0,
      costUsd: 0,
    };
  });
}

function assertionCounts(
  value: unknown,
  changes: unknown[],
): ReplayEvidence["assertions"] {
  const item = asRecord(value);
  if (Object.keys(item).length > 0) {
    return {
      passed: numberValue(item.passed) ?? 0,
      review: numberValue(item.review) ?? 0,
      failed: numberValue(item.failed) ?? 0,
    };
  }
  const normalized = changes.map(replayChangeFromRuntime);
  return {
    passed: normalized.filter((change) =>
      ["pass", "equivalent"].includes(change.verdict),
    ).length,
    review: normalized.filter((change) => change.verdict === "review").length,
    failed: normalized.filter((change) => change.verdict === "fail").length,
  };
}

function splitAssertionDetail(detail: string): {
  baseline: string;
  candidate: string;
} {
  const observedExpected = detail.match(/^observed=(.+?)\s+expected=(.+)$/);
  if (observedExpected) {
    return {
      baseline: observedExpected[2],
      candidate: observedExpected[1],
    };
  }
  const substring = detail.match(/^expected substring `(.+)` in `([\s\S]*)`$/);
  if (substring) {
    return {
      baseline: `contains ${substring[1]}`,
      candidate: substring[2],
    };
  }
  return {
    baseline: "Assertion contract",
    candidate: detail,
  };
}

function toolDetail(item: Record<string, unknown>, index: number): string {
  if (Object.keys(item).length === 0) {
    return `Missing turn ${index + 1}`;
  }
  const tool = stringValue(item.tool_name) ?? `turn ${index + 1}`;
  const status = stringValue(item.status) ?? "ok";
  return `${tool} · ${status} · ${stableStringify(item.arguments ?? {})}`;
}

function timelineKind(
  rawType: string,
  item: Record<string, unknown>,
): TimelineKind {
  const normalized = rawType.toLowerCase().replaceAll("_", "-");
  if (normalized.includes("tool-call")) return "tool-call";
  if (normalized.includes("tool-result")) return "tool-result";
  if (normalized.includes("error") || item.error) return "error";
  if (normalized.includes("user")) return "user";
  if (
    normalized.includes("assistant") ||
    normalized.includes("model") ||
    normalized.includes("final-answer")
  ) {
    return "model";
  }
  return "replay";
}

function titleFromKind(kind: TimelineKind): string {
  const labels: Record<TimelineKind, string> = {
    user: "User message",
    model: "Model response",
    "tool-call": "Tool call",
    "tool-result": "Tool result",
    replay: "Runtime event",
    error: "Runtime error",
  };
  return labels[kind];
}

function replayStatus(value: unknown): ReplayEvidence["status"] {
  if (value === "passed" || value === "failed" || value === "review") {
    return value;
  }
  return "review";
}

function replayVerdict(value: unknown): ReplayChange["verdict"] {
  if (
    value === "equivalent" ||
    value === "pass" ||
    value === "review" ||
    value === "fail"
  ) {
    return value;
  }
  return "review";
}

function comparisonVerdict(value: unknown): ComparisonCell["verdict"] {
  if (value === "pass" || value === "review" || value === "fail") {
    return value;
  }
  return "review";
}

function fileLabel(path: string, fallback: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? fallback;
}

function runtimeId(prefix: string, input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-runtime-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function displayValue(value: unknown): string {
  return typeof value === "string" ? value : stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "No value";
  return JSON.stringify(sortJson(value), null, 2);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
