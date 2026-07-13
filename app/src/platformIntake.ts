import {
  ensureIntakeInstallSigningKeypair,
  type IntakeInstallSigningKeypair,
  type KeychainApi,
} from "@auraone/platform-contracts";
import {
  isTauriRuntime,
  loadPlatformKeychainApi,
} from "./platformBridge";

export type { IntakeInstallSigningKeypair };

const AGENT_STUDIO_KEYCHAIN_SERVICE = "agent-studio-open";

export interface AgentIntakeSigningDependencies {
  isDesktopRuntime: () => boolean;
  loadKeychain: () => Promise<KeychainApi>;
  generateKeypair: () => Promise<IntakeInstallSigningKeypair>;
}

const defaultDependencies: AgentIntakeSigningDependencies = {
  isDesktopRuntime: isTauriRuntime,
  loadKeychain: loadPlatformKeychainApi,
  generateKeypair: generateAgentIntakeEd25519Keypair,
};

export async function ensureAgentIntakeInstallSigningKeypair(
  overrides: Partial<AgentIntakeSigningDependencies> = {},
): Promise<IntakeInstallSigningKeypair> {
  const dependencies = { ...defaultDependencies, ...overrides };
  if (!dependencies.isDesktopRuntime()) {
    throw new Error(
      "Intake install signing is available only in the Tauri desktop app; browser mode generates and stores no signing key.",
    );
  }

  const keychain = await dependencies.loadKeychain();
  return ensureIntakeInstallSigningKeypair(
    keychain,
    AGENT_STUDIO_KEYCHAIN_SERVICE,
    dependencies.generateKeypair,
  );
}

export async function generateAgentIntakeEd25519Keypair(
  webCrypto: Pick<Crypto, "subtle"> = globalThis.crypto,
  now: () => Date = () => new Date(),
): Promise<IntakeInstallSigningKeypair> {
  if (!webCrypto?.subtle) {
    throw new Error(
      "WebCrypto is unavailable; no intake signing key was generated.",
    );
  }

  const generated = await webCrypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  );
  if (!("publicKey" in generated) || !("privateKey" in generated)) {
    throw new Error("The runtime did not return an Ed25519 keypair.");
  }

  const [publicKey, privateKey] = await Promise.all([
    webCrypto.subtle.exportKey("spki", generated.publicKey),
    webCrypto.subtle.exportKey("pkcs8", generated.privateKey),
  ]);

  return {
    algorithm: "Ed25519",
    public_key: encodeBase64(publicKey),
    private_key: encodeBase64(privateKey),
    created_at: now().toISOString(),
  };
}

function encodeBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return globalThis.btoa(binary);
}
