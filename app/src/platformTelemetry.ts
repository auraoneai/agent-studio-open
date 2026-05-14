export interface TelemetryApp {
  flagship: "agent-studio-open";
  version: string;
  channel: "alpha" | "beta" | "stable";
}

export interface TelemetryDevice {
  install_id: string;
  os: "darwin" | "windows" | "linux";
  os_version: string;
  arch: "x86_64" | "aarch64";
}

export interface TelemetryEvent {
  $schema: "https://auraone.ai/schemas/platform-telemetry-event.v1.json";
  event_id: string;
  event_name: string;
  event_version: number;
  app: TelemetryApp;
  device: TelemetryDevice;
  session_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TelemetryValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TelemetryLogEntry {
  status: "sent" | "would_send";
  event: TelemetryEvent;
  validation: TelemetryValidationResult;
  recorded_at: string;
}

export interface AuraTelemetryEvent {
  id: string;
  name: string;
  timestamp: string;
  optedIn: boolean;
  destination: "telemetry" | "local";
  payloadPreview: Record<string, unknown> & { validation: "valid" | string[] };
}

const EVENT_NAME_RE = /^[a-z][a-z0-9_]*$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_KEY_RE =
  /(content|text|prompt|sample|rubric|criterion|trace|path|hostname|ip|email|display_name|api_key|token|secret)/i;

export class TelemetryEventLog {
  private entries: TelemetryLogEntry[] = [];

  record(event: TelemetryEvent, telemetryOptedIn: boolean): TelemetryLogEntry {
    const entry: TelemetryLogEntry = {
      status: telemetryOptedIn ? "sent" : "would_send",
      event,
      validation: validateTelemetryEvent(event),
      recorded_at: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  list(): readonly TelemetryLogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}

export function createTelemetryEvent(input: {
  eventId: string;
  eventName: string;
  timestamp: string;
  sessionId: string;
  app: TelemetryApp;
  device: TelemetryDevice;
  payload?: Record<string, unknown>;
}): TelemetryEvent {
  return {
    $schema: "https://auraone.ai/schemas/platform-telemetry-event.v1.json",
    event_id: input.eventId,
    event_name: input.eventName,
    event_version: 1,
    app: input.app,
    device: input.device,
    session_id: input.sessionId,
    timestamp: input.timestamp,
    payload: input.payload ?? {},
  };
}

export function toAuraTelemetryEvents(entries: readonly TelemetryLogEntry[]): AuraTelemetryEvent[] {
  return entries.map((entry) => ({
    id: entry.event.event_id,
    name: entry.event.event_name,
    timestamp: entry.recorded_at,
    optedIn: entry.status === "sent",
    destination: entry.status === "sent" ? "telemetry" : "local",
    payloadPreview: {
      validation: entry.validation.valid ? "valid" : entry.validation.errors,
      ...entry.event.payload,
    },
  }));
}

function validateTelemetryEvent(event: TelemetryEvent): TelemetryValidationResult {
  const errors: string[] = [];
  if (!UUID_RE.test(event.event_id)) {
    errors.push("event_id must be a UUID");
  }
  if (!EVENT_NAME_RE.test(event.event_name)) {
    errors.push("event_name must be snake_case");
  }
  for (const key of Object.keys(event.payload)) {
    if (FORBIDDEN_KEY_RE.test(key)) {
      errors.push(`payload key is not allowed: ${key}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
