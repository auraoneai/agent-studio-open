import {
  FLAGSHIPS,
  INTAKE_ENDPOINT,
  INTAKE_SCHEMA_ID,
  PLATFORM_OSES,
  type Flagship,
  type PlatformOs,
} from './constants.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;

export const INTAKE_ROLES = [
  'rubric_definition',
  'rubric_criterion',
  'rubric_sample',
  'rubric_calibration_set',
  'rubric_judge_card',
  'rubric_eval_run_manifest',
  'robotics_reviewed_subset_manifest',
  'robotics_episode_reference',
  'robotics_failure_cluster',
  'robotics_intervention_note',
  'robotics_embodiment_card',
  'robotics_sensor_qa_report',
  'agent_mcp_server_metadata',
  'agent_trace_card',
  'agent_regression_test_suite',
  'agent_otel_spans',
] as const;

export type IntakeRole = (typeof INTAKE_ROLES)[number];

export const ROBOTICS_INTAKE_ROLES = [
  'robotics_reviewed_subset_manifest',
  'robotics_episode_reference',
  'robotics_failure_cluster',
  'robotics_intervention_note',
  'robotics_embodiment_card',
  'robotics_sensor_qa_report',
] as const satisfies readonly IntakeRole[];

export interface IntakeCreator {
  display_name: string;
  email?: string;
}

export interface IntakePayloadItem {
  path: `payload/${string}`;
  role: IntakeRole;
  sha256: string;
  size_bytes: number;
}

export interface IntakePacketManifest {
  $schema: typeof INTAKE_SCHEMA_ID;
  manifest_version: '1.0.0';
  product: Flagship;
  product_version: string;
  platform_version: string;
  created_at: string;
  project_id: string;
  creator: IntakeCreator;
  intent: string;
  redaction: {
    file_paths: true;
    hostnames: true;
    api_keys: true;
    user_pii_other_than_explicit_intake: true;
    custom_rules_applied: string[];
  };
  consent: {
    user_acknowledged_preview: true;
    user_acknowledged_transport: true;
    timestamp: string;
  };
  payload_manifest: IntakePayloadItem[];
  provenance: {
    engine_libs: Record<string, string>;
    os: PlatformOs;
    os_version: string;
    app_install_id_hash: string;
  };
  transport: {
    destination: typeof INTAKE_ENDPOINT;
    intended_at: string;
  };
}

export interface IntakePreview {
  file_count: number;
  total_size_bytes: number;
  destination: typeof INTAKE_ENDPOINT;
  manifest: IntakePacketManifest;
  sent_copy: string[];
  never_sent_copy: string[];
}

export function validateIntakeManifest(manifest: IntakePacketManifest): string[] {
  const errors: string[] = [];

  if (manifest.$schema !== INTAKE_SCHEMA_ID) {
    errors.push('Intake manifest must use the platform schema id.');
  }
  if (manifest.manifest_version !== '1.0.0') {
    errors.push('manifest_version must be 1.0.0.');
  }
  if (!FLAGSHIPS.includes(manifest.product)) {
    errors.push('product must be a registered AuraOne Open flagship.');
  }
  if (!UUID_RE.test(manifest.project_id)) {
    errors.push('project_id must be a client-generated UUID.');
  }
  if (!manifest.creator.display_name.trim()) {
    errors.push('creator.display_name must be explicitly provided by the user.');
  }
  if (!manifest.intent.trim()) {
    errors.push('intent must be explicitly provided by the user.');
  }
  if (manifest.redaction.file_paths !== true) {
    errors.push('file path redaction must be enabled.');
  }
  if (manifest.redaction.hostnames !== true) {
    errors.push('hostname redaction must be enabled.');
  }
  if (manifest.redaction.api_keys !== true) {
    errors.push('API key redaction must be enabled.');
  }
  if (manifest.redaction.user_pii_other_than_explicit_intake !== true) {
    errors.push('PII redaction must be enabled.');
  }
  if (manifest.consent.user_acknowledged_preview !== true) {
    errors.push('User must acknowledge local packet preview.');
  }
  if (manifest.consent.user_acknowledged_transport !== true) {
    errors.push('User must acknowledge transport destination.');
  }
  if (!manifest.payload_manifest.length) {
    errors.push('payload_manifest must include at least one file.');
  }

  for (const item of manifest.payload_manifest) {
    if (!item.path.startsWith('payload/')) {
      errors.push(`Payload path must stay inside payload/: ${item.path}`);
    }
    if (item.path.includes('..')) {
      errors.push(`Payload path must not include parent traversal: ${item.path}`);
    }
    if (!INTAKE_ROLES.includes(item.role)) {
      errors.push(`Unknown intake role: ${item.role}`);
    }
    if (manifest.product === 'robotics-studio-open') {
      if (
        !ROBOTICS_INTAKE_ROLES.includes(
          item.role as (typeof ROBOTICS_INTAKE_ROLES)[number],
        )
      ) {
        errors.push(
          `Robotics Studio Open intake role is not registered for robotics: ${item.role}`,
        );
      }
      if (/\.(mp4|mov|mkv|avi|bag|db3|sqlite3)$/i.test(item.path)) {
        errors.push(
          `Robotics Studio Open intake must reference raw video and ROS bags, not embed them: ${item.path}`,
        );
      }
    }
    if (!SHA256_RE.test(item.sha256)) {
      errors.push(`Invalid sha256 for ${item.path}`);
    }
    if (!Number.isInteger(item.size_bytes) || item.size_bytes <= 0) {
      errors.push(`size_bytes must be positive for ${item.path}`);
    }
  }

  if (!PLATFORM_OSES.includes(manifest.provenance.os)) {
    errors.push('provenance.os must be darwin, windows, or linux.');
  }
  if (!SHA256_RE.test(manifest.provenance.app_install_id_hash)) {
    errors.push('app_install_id_hash must be a SHA-256 hash, never the raw install id.');
  }
  if (manifest.transport.destination !== INTAKE_ENDPOINT) {
    errors.push('transport.destination must be the platform intake endpoint.');
  }

  return errors;
}

export function createIntakePreview(manifest: IntakePacketManifest): IntakePreview {
  const errors = validateIntakeManifest(manifest);
  if (errors.length) {
    throw new Error(`Invalid intake manifest: ${errors.join('; ')}`);
  }

  return {
    file_count: manifest.payload_manifest.length,
    total_size_bytes: manifest.payload_manifest.reduce(
      (total, item) => total + item.size_bytes,
      0,
    ),
    destination: INTAKE_ENDPOINT,
    manifest,
    sent_copy: [
      'Manifest fields explicitly reviewed by the user.',
      'Payload files listed in payload_manifest.',
      'Redacted provenance and app version metadata.',
    ],
    never_sent_copy: [
      'API keys.',
      'File system paths from the user machine.',
      'Hostnames.',
      'User PII beyond explicit intake fields.',
    ],
  };
}

export interface IntakeUploadResponse {
  packet_id: string;
  received_at: string;
  cloud_url: string;
  import_status: 'queued' | 'processing' | 'imported' | 'rejected';
  next_step: string;
}

export interface IntakeUploadRequest {
  endpoint: typeof INTAKE_ENDPOINT;
  product: Flagship;
  install_id_hash: string;
  packet_field_name: 'packet';
}

export interface IntakeFailurePlan {
  status: number | 'network';
  user_message: string;
  queue_for_retry: boolean;
  retry_after_ms?: number;
  diagnostics?: string[];
  docs_url?: string;
}

export function createIntakeUploadRequest(
  manifest: IntakePacketManifest,
): IntakeUploadRequest {
  const errors = validateIntakeManifest(manifest);
  if (errors.length) {
    throw new Error(`Invalid intake manifest: ${errors.join('; ')}`);
  }

  return {
    endpoint: INTAKE_ENDPOINT,
    product: manifest.product,
    install_id_hash: manifest.provenance.app_install_id_hash,
    packet_field_name: 'packet',
  };
}

export function classifyIntakeFailure(
  status: number | 'network',
  body: {
    error_code?: string;
    error_message?: string;
    diagnostics?: string[];
    docs_url?: string;
  } = {},
  attempt = 0,
): IntakeFailurePlan {
  if (status === 'network' || status >= 500) {
    const retryAfterMs = Math.min(300_000, 2_000 * 2 ** Math.max(0, attempt));
    return {
      status,
      user_message: 'Network unavailable. The packet is saved locally and will retry automatically.',
      queue_for_retry: true,
      retry_after_ms: retryAfterMs,
    };
  }

  if (status === 413) {
    return {
      status,
      user_message: 'Packet exceeds the upload size limit. Remove files from the preview and try again.',
      queue_for_retry: false,
    };
  }

  if (status === 422) {
    return {
      status,
      user_message: body.error_message || 'Packet validation failed.',
      queue_for_retry: false,
      diagnostics: body.diagnostics || [],
    };
  }

  if (status === 409) {
    return {
      status,
      user_message: body.error_message || 'Cloud needs an upgrade.',
      queue_for_retry: false,
      docs_url: body.docs_url,
    };
  }

  return {
    status,
    user_message: body.error_message || 'Intake upload failed.',
    queue_for_retry: false,
  };
}
