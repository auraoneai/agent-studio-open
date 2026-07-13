export const PLATFORM_VERSION = '0.3.0';

export const CANONICAL_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https://updates.auraone.ai https://updates2.auraone.ai https://intake.auraone.ai https://o.auraone.ai https://sentry.io; frame-src 'none'; object-src 'none'; base-uri 'self'";

export const AURAONE_URL_SCHEME = 'auraone';

export const UPDATE_ENDPOINT_TEMPLATE =
  'https://updates.auraone.ai/<flagship>/{{target}}/{{arch}}/{{current_version}}';

export const UPDATE_FALLBACK_ENDPOINT_TEMPLATE =
  'https://updates2.auraone.ai/<flagship>/{{target}}/{{arch}}/{{current_version}}';

export const INTAKE_ENDPOINT = 'https://intake.auraone.ai/v1/packets/';

export const TELEMETRY_ENDPOINT = 'https://o.auraone.ai/v1/events';

export const TELEMETRY_SCHEMA_ID =
  'https://schemas.auraone.ai/open-studio/telemetry/v1.json';

export const INTAKE_SCHEMA_ID =
  'https://schemas.auraone.ai/open-studio/intake-packet/v1.json';

export const REQUIRED_TAURI_CAPABILITIES = [
  'core:default',
  'fs:allow-appdata-read',
  'fs:allow-appdata-write',
  'dialog:default',
  'notification:default',
  'os:default',
  'process:default',
  'updater:default',
  'clipboard-manager:default',
  'deep-link:default',
] as const;

export const DISALLOWED_DEFAULT_TAURI_CAPABILITIES = [
  'shell:open',
  'shell:execute',
  'http:default',
] as const;

export type Flagship =
  | 'rubric-studio-open'
  | 'robotics-studio-open'
  | 'agent-studio-open';

export type ReleaseChannel = 'stable' | 'beta' | 'nightly';

export type PlatformOs = 'darwin' | 'windows' | 'linux';

export type PlatformArch = 'x86_64' | 'aarch64';

export const FLAGSHIPS: readonly Flagship[] = [
  'rubric-studio-open',
  'robotics-studio-open',
  'agent-studio-open',
];

export const RELEASE_CHANNELS: readonly ReleaseChannel[] = [
  'stable',
  'beta',
  'nightly',
];

export const PLATFORM_OSES: readonly PlatformOs[] = ['darwin', 'windows', 'linux'];

export const PLATFORM_ARCHES: readonly PlatformArch[] = ['x86_64', 'aarch64'];

export function assertCanonicalCsp(csp: string): void {
  const requiredTokens = [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    'https://updates.auraone.ai',
    'https://updates2.auraone.ai',
    'https://intake.auraone.ai',
    'https://o.auraone.ai',
    'https://sentry.io',
    "object-src 'none'",
    "base-uri 'self'",
  ];

  for (const token of requiredTokens) {
    if (!csp.includes(token)) {
      throw new Error(`Canonical CSP missing token: ${token}`);
    }
  }
  if (csp.includes("'unsafe-eval'")) {
    throw new Error('Canonical CSP must not allow unsafe-eval.');
  }
}
