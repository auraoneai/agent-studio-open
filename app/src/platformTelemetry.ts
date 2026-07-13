import {
  TelemetryEventLog,
  createTelemetryEvent,
  type TelemetryEvent,
  type TelemetryLogEntry,
} from "@auraone/platform-contracts";

export { TelemetryEventLog, createTelemetryEvent };
export type { TelemetryEvent, TelemetryLogEntry };

export type AgentTelemetryDeliveryStatus = "local_preview" | "would_send";

export type AuraTelemetryEvent = {
  id: string;
  name: string;
  timestamp: string;
  optedIn: boolean;
  destination: "local";
  deliveryStatus: AgentTelemetryDeliveryStatus;
  payloadPreview: Record<string, unknown> & {
    validation: "valid" | string[];
  };
};

export type LocalTelemetryLogEntry = Omit<TelemetryLogEntry, "status"> & {
  status: AgentTelemetryDeliveryStatus;
};

export function normalizeTelemetryDeliveryStatus(
  status: TelemetryLogEntry["status"] | string,
): AgentTelemetryDeliveryStatus {
  if (String(status) === "local_preview") {
    return "local_preview";
  }
  return "would_send";
}

export function toLocalTelemetryLogEntries(
  entries: readonly TelemetryLogEntry[],
): LocalTelemetryLogEntry[] {
  return entries.map((entry) => ({
    ...entry,
    status: normalizeTelemetryDeliveryStatus(entry.status),
  }));
}

export function toAuraTelemetryEvents(
  entries: readonly TelemetryLogEntry[],
): AuraTelemetryEvent[] {
  return entries.map((entry) => {
    const deliveryStatus = normalizeTelemetryDeliveryStatus(entry.status);
    return {
      id: entry.event.event_id,
      name: entry.event.event_name,
      timestamp: entry.recorded_at,
      optedIn: deliveryStatus === "local_preview",
      destination: "local",
      deliveryStatus,
      payloadPreview: {
        validation: entry.validation.valid ? "valid" : entry.validation.errors,
        deliveryStatus,
        ...entry.event.payload,
      },
    };
  });
}
