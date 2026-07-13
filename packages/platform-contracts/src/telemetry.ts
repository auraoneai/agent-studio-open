import {
  FLAGSHIPS,
  PLATFORM_ARCHES,
  PLATFORM_OSES,
  RELEASE_CHANNELS,
  TELEMETRY_ENDPOINT,
  TELEMETRY_SCHEMA_ID,
  type Flagship,
  type PlatformArch,
  type PlatformOs,
  type ReleaseChannel,
} from './constants.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const EVENT_NAME_RE = /^[a-z][a-z0-9_]*$/;
const FORBIDDEN_KEY_RE =
  /(content|text|prompt|sample|rubric|criterion|trace|path|hostname|ip|email|display_name|api_key|token|secret)/i;
const API_KEY_RE =
  /(sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,})/;

export interface TelemetryApp {
  flagship: Flagship;
  version: string;
  channel: ReleaseChannel;
}

export interface TelemetryDevice {
  install_id: string;
  os: PlatformOs;
  os_version: string;
  arch: PlatformArch;
}

export interface TelemetryEvent {
  $schema: typeof TELEMETRY_SCHEMA_ID;
  event_id: string;
  event_name: string;
  event_version: number;
  app: TelemetryApp;
  device: TelemetryDevice;
  session_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TelemetryRegistryEvent {
  name: string;
  description: string;
  owner: 'platform' | 'flagship' | string;
  since: string;
  payload_schema?: Record<string, unknown>;
}

export interface TelemetryValidationResult {
  valid: boolean;
  errors: string[];
}

export const PLATFORM_TELEMETRY_EVENTS: readonly TelemetryRegistryEvent[] = [
  {
    name: 'app_launched',
    description: 'The app started.',
    owner: 'platform',
    since: '0.1.0',
  },
  {
    name: 'welcome_wizard_completed',
    description:
      'The user finished the welcome wizard, including telemetry and crash opt-in choices.',
    owner: 'platform',
    since: '0.1.0',
  },
  {
    name: 'update_check_performed',
    description: 'The app checked for an update.',
    owner: 'platform',
    since: '0.1.0',
  },
  {
    name: 'update_applied',
    description: 'The app updated to a new version.',
    owner: 'platform',
    since: '0.1.0',
  },
  {
    name: 'feature_used',
    description: 'A registered feature was used; payload includes feature ID only.',
    owner: 'flagship',
    since: '0.1.0',
  },
  {
    name: 'error_encountered',
    description:
      'A non-crash error was encountered; payload includes error category only.',
    owner: 'platform',
    since: '0.1.0',
  },
  {
    name: 'session_ended',
    description: 'A session ended.',
    owner: 'platform',
    since: '0.1.0',
  },
  {
    name: 'intake_packet_exported',
    description:
      'An intake packet was created and separately uploaded by explicit user action.',
    owner: 'platform',
    since: '0.1.0',
  },
  {
    name: 'robotics_dataset_opened',
    description:
      'Robotics Studio Open opened a dataset format; payload includes format and episode-count bucket only.',
    owner: 'robotics-studio-open',
    since: '0.1.0',
  },
  {
    name: 'robotics_feature_used',
    description:
      'A Robotics Studio Open feature was used; payload includes a registered feature ID only.',
    owner: 'robotics-studio-open',
    since: '0.1.0',
  },
  {
    name: 'robotics_export_completed',
    description:
      'Robotics Studio Open completed an export; payload includes target and payload role count only.',
    owner: 'robotics-studio-open',
    since: '0.1.0',
  },
  {
    name: 'agent_protocol_surface_used',
    description:
      'An Agent Studio Open protocol surface was used without recording protocol contents.',
    owner: 'agent-studio-open',
    since: '0.3.0',
  },
];

export function createTelemetryEvent(input: {
  eventName: string;
  app: TelemetryApp;
  device: TelemetryDevice;
  sessionId: string;
  payload?: Record<string, unknown>;
  eventId: string;
  timestamp: string;
  eventVersion?: number;
}): TelemetryEvent {
  return {
    $schema: TELEMETRY_SCHEMA_ID,
    event_id: input.eventId,
    event_name: input.eventName,
    event_version: input.eventVersion ?? 1,
    app: input.app,
    device: input.device,
    session_id: input.sessionId,
    timestamp: input.timestamp,
    payload: input.payload ?? {},
  };
}

export function validateTelemetryEvent(
  event: TelemetryEvent,
  registry: readonly TelemetryRegistryEvent[] = PLATFORM_TELEMETRY_EVENTS,
): TelemetryValidationResult {
  const errors: string[] = [];
  const registeredNames = new Set(registry.map((entry) => entry.name));

  if (event.$schema !== TELEMETRY_SCHEMA_ID) {
    errors.push('Telemetry event must use the platform schema id.');
  }
  if (!UUID_RE.test(event.event_id)) {
    errors.push('event_id must be a UUID.');
  }
  if (!EVENT_NAME_RE.test(event.event_name)) {
    errors.push('event_name must be snake_case.');
  }
  if (!registeredNames.has(event.event_name)) {
    errors.push(`event_name is not registered: ${event.event_name}`);
  }
  if (!Number.isInteger(event.event_version) || event.event_version < 1) {
    errors.push('event_version must be a positive integer.');
  }
  if (!FLAGSHIPS.includes(event.app.flagship)) {
    errors.push('app.flagship must be a registered AuraOne Open flagship.');
  }
  if (!SEMVER_RE.test(event.app.version)) {
    errors.push('app.version must be semver.');
  }
  if (!RELEASE_CHANNELS.includes(event.app.channel)) {
    errors.push('app.channel must be stable, beta, or nightly.');
  }
  if (!UUID_RE.test(event.device.install_id)) {
    errors.push('device.install_id must be a random install UUID.');
  }
  if (!PLATFORM_OSES.includes(event.device.os)) {
    errors.push('device.os must be darwin, windows, or linux.');
  }
  if (!PLATFORM_ARCHES.includes(event.device.arch)) {
    errors.push('device.arch must be x86_64 or aarch64.');
  }
  if (!UUID_RE.test(event.session_id)) {
    errors.push('session_id must be a UUID.');
  }
  if (Number.isNaN(Date.parse(event.timestamp))) {
    errors.push('timestamp must be ISO 8601.');
  }

  errors.push(...findForbiddenTelemetryPayload(event.payload));

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function findForbiddenTelemetryPayload(
  payload: Record<string, unknown>,
): string[] {
  const errors: string[] = [];

  function visit(value: unknown, keyPath: string): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${keyPath}[${index}]`));
      return;
    }

    if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        const nextPath = keyPath ? `${keyPath}.${key}` : key;
        if (FORBIDDEN_KEY_RE.test(key)) {
          errors.push(`payload key is forbidden: ${nextPath}`);
        }
        visit(nested, nextPath);
      }
      return;
    }

    if (typeof value === 'string') {
      if (value.includes('/') || value.includes('\\')) {
        errors.push(`payload string must not contain file paths or URLs: ${keyPath}`);
      }
      if (API_KEY_RE.test(value)) {
        errors.push(`payload string looks like a secret: ${keyPath}`);
      }
    }
  }

  visit(payload, '');
  return errors;
}

export interface TelemetryTransport {
  endpoint: typeof TELEMETRY_ENDPOINT;
  batchSize: 100;
  flushIntervalMs: 30000;
  failureMode: 'silent';
}

export const TELEMETRY_TRANSPORT: TelemetryTransport = {
  endpoint: TELEMETRY_ENDPOINT,
  batchSize: 100,
  flushIntervalMs: 30000,
  failureMode: 'silent',
};
