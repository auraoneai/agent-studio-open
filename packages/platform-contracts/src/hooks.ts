import { RELEASE_CHANNELS, type ReleaseChannel } from './constants.js';

export type PlatformExtensionHookKind =
  | 'robotics_video_decode'
  | 'robotics_dataset_stream'
  | 'robotics_ros_adapter'
  | 'mcp_transport'
  | 'otlp_receiver'
  | 'llm_gateway_provider'
  | 'intake_payload_role';

export type PlatformExtensionSurface = 'desktop' | 'browser' | 'cli' | 'vscode';

export interface PlatformExtensionHook {
  id: string;
  kind: PlatformExtensionHookKind;
  surface: PlatformExtensionSurface;
  enabled_in: ReleaseChannel[];
}

export const ROBOTICS_STUDIO_EXTENSION_HOOKS: readonly PlatformExtensionHook[] = [
  {
    id: 'video.decode.videotoolbox',
    kind: 'robotics_video_decode',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'video.decode.vaapi',
    kind: 'robotics_video_decode',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'video.decode.nvdec',
    kind: 'robotics_video_decode',
    surface: 'desktop',
    enabled_in: ['beta', 'nightly'],
  },
  {
    id: 'dataset.stream.chunked_ipc',
    kind: 'robotics_dataset_stream',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'dataset.stream.sqlite_sidecar_index',
    kind: 'robotics_dataset_stream',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'ros.rosbag2_sqlite',
    kind: 'robotics_ros_adapter',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'ros.rosbag1_legacy',
    kind: 'robotics_ros_adapter',
    surface: 'desktop',
    enabled_in: ['beta', 'nightly'],
  },
];

export const AGENT_STUDIO_EXTENSION_HOOKS: readonly PlatformExtensionHook[] = [
  {
    id: 'mcp.stdio',
    kind: 'mcp_transport',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'mcp.sse',
    kind: 'mcp_transport',
    surface: 'browser',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'mcp.http',
    kind: 'mcp_transport',
    surface: 'browser',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'mcp.websocket',
    kind: 'mcp_transport',
    surface: 'browser',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'otlp.http_json',
    kind: 'otlp_receiver',
    surface: 'desktop',
    enabled_in: ['beta', 'nightly'],
  },
  {
    id: 'otlp.http_proto',
    kind: 'otlp_receiver',
    surface: 'desktop',
    enabled_in: ['beta', 'nightly'],
  },
  {
    id: 'otlp.grpc',
    kind: 'otlp_receiver',
    surface: 'desktop',
    enabled_in: ['beta', 'nightly'],
  },
  {
    id: 'llm_gateway.anthropic',
    kind: 'llm_gateway_provider',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'llm_gateway.openai',
    kind: 'llm_gateway_provider',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'llm_gateway.google',
    kind: 'llm_gateway_provider',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'llm_gateway.ollama',
    kind: 'llm_gateway_provider',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'intake.agent_mcp_server_metadata',
    kind: 'intake_payload_role',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'intake.agent_trace_card',
    kind: 'intake_payload_role',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'intake.agent_regression_test_suite',
    kind: 'intake_payload_role',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
  {
    id: 'intake.agent_otel_spans',
    kind: 'intake_payload_role',
    surface: 'desktop',
    enabled_in: ['stable', 'beta', 'nightly'],
  },
];

export function validatePlatformExtensionHook(hook: PlatformExtensionHook): string[] {
  const errors: string[] = [];

  if (!/^[a-z][a-z0-9._-]*$/.test(hook.id)) {
    errors.push(`Invalid hook id: ${hook.id}`);
  }
  if (hook.enabled_in.length === 0) {
    errors.push(`Hook must be enabled in at least one channel: ${hook.id}`);
  }
  for (const channel of hook.enabled_in) {
    if (!RELEASE_CHANNELS.includes(channel)) {
      errors.push(`Invalid hook channel: ${channel}`);
    }
  }
  if (hook.surface === 'browser' && hook.id === 'mcp.stdio') {
    errors.push('Browser edition must not enable stdio MCP.');
  }
  if (hook.surface === 'browser' && hook.kind === 'otlp_receiver') {
    errors.push('Browser edition must not enable OTLP receivers.');
  }
  if (
    hook.surface !== 'desktop' &&
    (hook.kind === 'robotics_video_decode' ||
      hook.kind === 'robotics_dataset_stream' ||
      hook.kind === 'robotics_ros_adapter')
  ) {
    errors.push('Robotics video, dataset, and ROS platform hooks are desktop-only.');
  }

  return errors;
}

export function hooksForSurface(
  surface: PlatformExtensionSurface,
): PlatformExtensionHook[] {
  return [...ROBOTICS_STUDIO_EXTENSION_HOOKS, ...AGENT_STUDIO_EXTENSION_HOOKS].filter(
    (hook) => hook.surface === surface,
  );
}
