export interface KeychainKey {
  service: string;
  scope: string;
  identifier: string;
}

export interface KeychainApi {
  set(key: KeychainKey, value: string): Promise<void>;
  get(key: KeychainKey): Promise<string | null>;
  delete(key: KeychainKey): Promise<void>;
  list(service: string, scope: string): Promise<string[]>;
}

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const ALLOWED_SECRET_SCOPES = [
  'byo-api-keys',
  'sentry-token',
  'huggingface-token',
  'auraone-cloud-token',
  'enterprise-mtls-identity',
  'updater-signing-key',
  'intake-install-signing-key',
] as const;

export type AllowedSecretScope = (typeof ALLOWED_SECRET_SCOPES)[number];

export function isAllowedSecretScope(scope: string): scope is AllowedSecretScope {
  return (ALLOWED_SECRET_SCOPES as readonly string[]).includes(scope);
}

export function validateKeychainKey(key: KeychainKey): void {
  for (const [field, value] of Object.entries(key)) {
    if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(value)) {
      throw new Error(`Invalid keychain ${field}: ${value}`);
    }
  }
  if (!isAllowedSecretScope(key.scope)) {
    throw new Error(`Keychain scope is not approved for secret storage: ${key.scope}`);
  }
}

export function createTauriKeychainApi(invoke: TauriInvoke): KeychainApi {
  return {
    async set(key, value) {
      validateKeychainKey(key);
      await invoke('platform_keychain_set', {
        key,
        value,
        secret: true,
      });
    },
    async get(key) {
      validateKeychainKey(key);
      return invoke<string | null>('platform_keychain_get', {
        key,
        secret: true,
      });
    },
    async delete(key) {
      validateKeychainKey(key);
      await invoke('platform_keychain_delete', { key });
    },
    async list(service, scope) {
      validateKeychainKey({ service, scope, identifier: 'list' });
      return invoke<string[]>('platform_keychain_list', { service, scope });
    },
  };
}

export const INTAKE_INSTALL_KEYPAIR_SCOPE = 'intake-install-signing-key';
export const INTAKE_INSTALL_KEYPAIR_IDENTIFIER = 'ed25519-install-keypair-v1';

export interface IntakeInstallSigningKeypair {
  algorithm: 'Ed25519';
  public_key: string;
  private_key: string;
  created_at: string;
}

export type IntakeInstallSigningKeypairGenerator = () =>
  | IntakeInstallSigningKeypair
  | Promise<IntakeInstallSigningKeypair>;

export function intakeInstallSigningKeypairKey(service: string): KeychainKey {
  return {
    service,
    scope: INTAKE_INSTALL_KEYPAIR_SCOPE,
    identifier: INTAKE_INSTALL_KEYPAIR_IDENTIFIER,
  };
}

export async function ensureIntakeInstallSigningKeypair(
  keychain: KeychainApi,
  service: string,
  generateKeypair: IntakeInstallSigningKeypairGenerator,
): Promise<IntakeInstallSigningKeypair> {
  const key = intakeInstallSigningKeypairKey(service);
  const existing = await keychain.get(key);
  if (existing) {
    const parsed = JSON.parse(existing) as IntakeInstallSigningKeypair;
    validateIntakeInstallSigningKeypair(parsed);
    return parsed;
  }

  const generated = await generateKeypair();
  validateIntakeInstallSigningKeypair(generated);
  await keychain.set(key, JSON.stringify(generated));
  return generated;
}

export function validateIntakeInstallSigningKeypair(
  keypair: IntakeInstallSigningKeypair,
): void {
  if (keypair.algorithm !== 'Ed25519') {
    throw new Error('Intake install signing keypair must use Ed25519.');
  }
  if (!keypair.public_key.trim()) {
    throw new Error('Intake install signing keypair must include a public key.');
  }
  if (!keypair.private_key.trim()) {
    throw new Error('Intake install signing keypair must include a private key.');
  }
  if (Number.isNaN(Date.parse(keypair.created_at))) {
    throw new Error('Intake install signing keypair must include an ISO created_at timestamp.');
  }
}
