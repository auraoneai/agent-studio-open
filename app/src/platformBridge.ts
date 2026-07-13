import {
  createTauriKeychainApi,
  type KeychainApi,
  type TauriInvoke,
} from "@auraone/platform-contracts";
import type { BrowserProviderKeyRecord } from "../../web/src/browserEdition";
import {
  deleteBrowserProviderKey,
  listBrowserProviderKeys,
  loadBrowserProviderKey,
  saveBrowserProviderKey,
  validateByoProviderKey,
} from "../../web/src/browserEdition";
import type { Edition } from "./types";

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

export interface RuntimeCapabilities {
  edition: Edition;
  tauri: boolean;
  osKeychain: boolean;
  intakeSigning: boolean;
  localProcesses: boolean;
  localListeners: boolean;
}

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

export function getRuntimeCapabilities(
  tauriAvailable = isTauriRuntime(),
): RuntimeCapabilities {
  return {
    edition: tauriAvailable ? "desktop" : "browser",
    tauri: tauriAvailable,
    osKeychain: tauriAvailable,
    intakeSigning: tauriAvailable,
    localProcesses: tauriAvailable,
    localListeners: tauriAvailable,
  };
}

export async function loadPlatformKeychainApi(): Promise<KeychainApi> {
  if (!isTauriRuntime()) {
    throw new Error(
      "The OS keychain bridge is available only inside the Tauri desktop runtime.",
    );
  }
  return createTauriKeychainApi(await loadTauriInvoke());
}

export async function saveProviderKeySecret(
  provider: string,
  apiKey: string,
  passphrase: string,
): Promise<ProviderKeyRecord> {
  if (!isTauriRuntime()) {
    return saveBrowserProviderKey(provider, apiKey, passphrase);
  }
  const keychain = await loadPlatformKeychainApi();
  await keychain.set(providerKey(provider), apiKey);
  return { provider, updatedAt: "OS keychain" };
}

export async function loadProviderKeySecret(
  provider: string,
  passphrase: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    return loadBrowserProviderKey(provider, passphrase);
  }
  const keychain = await loadPlatformKeychainApi();
  const value = await keychain.get(providerKey(provider));
  if (!value) {
    throw new Error(`no provider key saved for ${provider}`);
  }
  return value;
}

export async function deleteProviderKeySecret(provider: string): Promise<void> {
  if (!isTauriRuntime()) {
    return deleteBrowserProviderKey(provider);
  }
  const keychain = await loadPlatformKeychainApi();
  await keychain.delete(providerKey(provider));
}

export async function listProviderKeySecrets(): Promise<ProviderKeyRecord[]> {
  if (!isTauriRuntime()) {
    return listBrowserProviderKeys();
  }
  const keychain = await loadPlatformKeychainApi();
  const providers = await keychain.list(KEYCHAIN_SERVICE, KEYCHAIN_SCOPE);
  return providers.map((provider) => ({ provider, updatedAt: "OS keychain" }));
}

function providerKey(provider: string): PlatformKeychainKey {
  return {
    service: KEYCHAIN_SERVICE,
    scope: KEYCHAIN_SCOPE,
    identifier: provider,
  };
}

async function loadTauriInvoke(): Promise<TauriInvoke> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke as TauriInvoke;
}
