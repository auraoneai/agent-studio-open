import {
  type TelemetryEvent,
  validateTelemetryEvent,
  type TelemetryValidationResult,
} from './telemetry.js';

export type TelemetryLogStatus = 'local_preview' | 'would_send';

export interface TelemetryLogEntry {
  status: TelemetryLogStatus;
  event: TelemetryEvent;
  validation: TelemetryValidationResult;
  recorded_at: string;
}

export class TelemetryEventLog {
  private entries: TelemetryLogEntry[] = [];

  record(event: TelemetryEvent, telemetryOptedIn: boolean): TelemetryLogEntry {
    const entry: TelemetryLogEntry = {
      status: telemetryOptedIn ? 'local_preview' : 'would_send',
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

  exportJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  clear(): void {
    this.entries = [];
  }
}
