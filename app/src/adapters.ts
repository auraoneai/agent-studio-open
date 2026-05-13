export interface AdapterInput {
  source: string;
  payload: unknown;
}

export interface NormalizedTrace {
  source: string;
  traceId: string;
  title: string;
  events: Array<{
    type: "message" | "tool_call" | "tool_result" | "span";
    name: string;
    payload: unknown;
  }>;
}

export interface TraceAdapter {
  id: string;
  label: string;
  canRead: (input: AdapterInput) => boolean;
  normalize: (input: AdapterInput) => NormalizedTrace;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, TraceAdapter>();

  register(adapter: TraceAdapter) {
    if (!adapter.id.trim()) {
      throw new Error("adapter id is required");
    }
    if (this.adapters.has(adapter.id)) {
      throw new Error(`adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  list(): TraceAdapter[] {
    return [...this.adapters.values()];
  }

  normalize(input: AdapterInput): NormalizedTrace {
    const adapter = this.list().find((candidate) => candidate.canRead(input));
    if (!adapter) {
      throw new Error(`no trace adapter can read ${input.source}`);
    }
    return adapter.normalize(input);
  }
}

export function createJsonTraceAdapter(options: {
  id: string;
  label: string;
  source: string;
  traceIdField: string;
  titleField: string;
}): TraceAdapter {
  return {
    id: options.id,
    label: options.label,
    canRead: (input) => input.source === options.source && isRecord(input.payload),
    normalize: (input) => {
      if (!isRecord(input.payload)) {
        throw new Error("adapter payload must be a JSON object");
      }
      return {
        source: input.source,
        traceId: String(input.payload[options.traceIdField] ?? "custom-trace"),
        title: String(input.payload[options.titleField] ?? options.label),
        events: Array.isArray(input.payload.events)
          ? input.payload.events.map((event, index) => ({
              type: isRecord(event) && typeof event.type === "string" ? normalizeEventType(event.type) : "span",
              name: isRecord(event) && typeof event.name === "string" ? event.name : `event-${index + 1}`,
              payload: event,
            }))
          : [],
      };
    },
  };
}

function normalizeEventType(value: string): NormalizedTrace["events"][number]["type"] {
  if (value === "message" || value === "tool_call" || value === "tool_result" || value === "span") {
    return value;
  }
  return "span";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
