import type { BrowserProviderKeyRecord } from "../../web/src/browserEdition";
import {
  deleteBrowserProviderKey,
  listBrowserProviderKeys,
  loadBrowserProviderKey,
  saveBrowserProviderKey,
  validateByoProviderKey,
} from "../../web/src/browserEdition";

const KEYCHAIN_SERVICE = "agent-studio-open";
const KEYCHAIN_SCOPE = "byo-api-keys";

type ProviderKeyRecord = Pick<
  BrowserProviderKeyRecord,
  "provider" | "updatedAt"
>;

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

interface PlatformKeychainKey {
  service: string;
  scope: string;
  identifier: string;
}

export type ProviderSecretMode = "os-keychain" | "browser-vault";

export { validateByoProviderKey };

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const tauriWindow = window as TauriWindow;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

export function providerSecretMode(): ProviderSecretMode {
  return isTauriRuntime() ? "os-keychain" : "browser-vault";
}

export async function saveProviderKeySecret(
  provider: string,
  apiKey: string,
  passphrase: string,
): Promise<ProviderKeyRecord> {
  if (!isTauriRuntime()) {
    return saveBrowserProviderKey(provider, apiKey, passphrase);
  }
  await invokeTauri<void>("platform_keychain_set", {
    key: providerKey(provider),
    value: apiKey,
    secret: true,
  });
  return { provider, updatedAt: "OS keychain" };
}

export async function loadProviderKeySecret(
  provider: string,
  passphrase: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    return loadBrowserProviderKey(provider, passphrase);
  }
  const value = await invokeTauri<string | null>("platform_keychain_get", {
    key: providerKey(provider),
    secret: true,
  });
  if (!value) {
    throw new Error(`no provider key saved for ${provider}`);
  }
  return value;
}

export async function deleteProviderKeySecret(provider: string): Promise<void> {
  if (!isTauriRuntime()) {
    return deleteBrowserProviderKey(provider);
  }
  await invokeTauri<void>("platform_keychain_delete", {
    key: providerKey(provider),
  });
}

export async function listProviderKeySecrets(): Promise<ProviderKeyRecord[]> {
  if (!isTauriRuntime()) {
    return listBrowserProviderKeys();
  }
  const providers = await invokeTauri<string[]>("platform_keychain_list", {
    service: KEYCHAIN_SERVICE,
    scope: KEYCHAIN_SCOPE,
  });
  return providers.map((provider) => ({ provider, updatedAt: "OS keychain" }));
}

function providerKey(provider: string): PlatformKeychainKey {
  return {
    service: KEYCHAIN_SERVICE,
    scope: KEYCHAIN_SCOPE,
    identifier: provider,
  };
}

async function invokeTauri<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}
