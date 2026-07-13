import { describe, expect, it } from "vitest";
import {
  TelemetryEventLog,
  createTelemetryEvent,
  normalizeTelemetryDeliveryStatus,
  toAuraTelemetryEvents,
  toLocalTelemetryLogEntries,
  type TelemetryLogEntry,
} from "../platformTelemetry";

function telemetryEvent() {
  return createTelemetryEvent({
    eventName: "agent_protocol_surface_used",
    eventId: "11111111-1111-4111-8111-111111111111",
    timestamp: "2026-07-13T12:00:00.000Z",
    sessionId: "22222222-2222-4222-8222-222222222222",
    app: {
      flagship: "agent-studio-open",
      version: "0.2.0",
      channel: "beta",
    },
    device: {
      install_id: "33333333-3333-4333-8333-333333333333",
      os: "darwin",
      os_version: "test",
      arch: "aarch64",
    },
    payload: { surface: "mcp" },
  });
}

describe("Agent telemetry local delivery display", () => {
  it("maps opted-in records to a local preview without claiming upload", () => {
    const log = new TelemetryEventLog();
    const entry = log.record(telemetryEvent(), true);

    expect(normalizeTelemetryDeliveryStatus(entry.status)).toBe(
      "local_preview",
    );
    expect(toAuraTelemetryEvents([entry])).toEqual([
      expect.objectContaining({
        optedIn: true,
        destination: "local",
        deliveryStatus: "local_preview",
      }),
    ]);
    expect(toLocalTelemetryLogEntries([entry])[0]?.status).toBe(
      "local_preview",
    );
  });

  it("maps the parent contract statuses to local-only delivery semantics", () => {
    const log = new TelemetryEventLog();
    const currentEntry = log.record(telemetryEvent(), false);
    const localPreviewEntry = {
      ...currentEntry,
      status: "local_preview",
    } as unknown as TelemetryLogEntry;
    const wouldSendEntry = {
      ...currentEntry,
      status: "would_send",
    } as TelemetryLogEntry;

    expect(toAuraTelemetryEvents([localPreviewEntry, wouldSendEntry])).toEqual([
      expect.objectContaining({
        optedIn: true,
        destination: "local",
        deliveryStatus: "local_preview",
      }),
      expect.objectContaining({
        optedIn: false,
        destination: "local",
        deliveryStatus: "would_send",
      }),
    ]);
  });
});
