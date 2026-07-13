import {
  UPDATE_FALLBACK_ENDPOINT_TEMPLATE,
  UPDATE_ENDPOINT_TEMPLATE,
  type Flagship,
  type PlatformArch,
  type ReleaseChannel,
} from './constants.js';

export interface PlatformUpdaterConfig {
  active: true;
  endpoints: [string, string];
  pubkey: string;
}

export interface UpdateManifest {
  schema_version: '1.0.0';
  flagship: Flagship;
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<
    string,
    {
      signature: string;
      url: string;
    }
  >;
  checksums: Record<string, string>;
  channel: ReleaseChannel;
  rollout: {
    percentage: number;
    mandatory: boolean;
    min_version: string;
    kill_switch?: boolean;
  };
  manifest_signature_algorithm: 'ed25519';
  manifest_signature: string;
}

export function createUpdaterEndpoint(flagship: Flagship): string {
  return UPDATE_ENDPOINT_TEMPLATE.replace('<flagship>', flagship);
}

export function createUpdaterFallbackEndpoint(flagship: Flagship): string {
  return UPDATE_FALLBACK_ENDPOINT_TEMPLATE.replace('<flagship>', flagship);
}

export function createUpdaterConfig(
  flagship: Flagship,
  pubkey: string,
): PlatformUpdaterConfig {
  return {
    active: true,
    endpoints: [
      createUpdaterEndpoint(flagship),
      createUpdaterFallbackEndpoint(flagship),
    ],
    pubkey,
  };
}

export function updateTarget(os: string, arch: PlatformArch): string {
  return `${os}-${arch}`;
}

export function assertUpdateAllowed(manifest: UpdateManifest): void {
  if (manifest.rollout.kill_switch || manifest.rollout.percentage === 0) {
    throw new Error('Platform update kill switch is active.');
  }
  if (manifest.rollout.percentage < 0 || manifest.rollout.percentage > 100) {
    throw new Error('Update rollout percentage must be between 0 and 100.');
  }
}
