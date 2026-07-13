import { webcrypto } from "node:crypto";
import {
  createTauriKeychainApi,
  intakeInstallSigningKeypairKey,
  type IntakeInstallSigningKeypair,
  type TauriInvoke,
} from "@auraone/platform-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  ensureAgentIntakeInstallSigningKeypair,
  generateAgentIntakeEd25519Keypair,
} from "../platformIntake";

const fixedKeypair: IntakeInstallSigningKeypair = {
  algorithm: "Ed25519",
  public_key: "cHVibGlj",
  private_key: "cHJpdmF0ZQ==",
  created_at: "2026-07-13T12:00:00.000Z",
};

describe("Agent intake install signing", () => {
  it("fails closed in browser mode before loading a keychain or generating a key", async () => {
    const loadKeychain = vi.fn();
    const generateKeypair = vi.fn();

    await expect(
      ensureAgentIntakeInstallSigningKeypair({
        isDesktopRuntime: () => false,
        loadKeychain,
        generateKeypair,
      }),
    ).rejects.toThrow(
      "browser mode generates and stores no signing key",
    );

    expect(loadKeychain).not.toHaveBeenCalled();
    expect(generateKeypair).not.toHaveBeenCalled();
  });

  it("generates exportable Ed25519 key material that can sign and verify", async () => {
    const keypair = await generateAgentIntakeEd25519Keypair(
      webcrypto as unknown as Crypto,
      () => new Date("2026-07-13T12:00:00.000Z"),
    );
    const publicKey = await webcrypto.subtle.importKey(
      "spki",
      Buffer.from(keypair.public_key, "base64"),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const privateKey = await webcrypto.subtle.importKey(
      "pkcs8",
      Buffer.from(keypair.private_key, "base64"),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const payload = new TextEncoder().encode("agent-studio-intake");
    const signature = await webcrypto.subtle.sign(
      "Ed25519",
      privateKey,
      payload,
    );

    expect(keypair).toMatchObject({
      algorithm: "Ed25519",
      created_at: "2026-07-13T12:00:00.000Z",
    });
    await expect(
      webcrypto.subtle.verify("Ed25519", publicKey, signature, payload),
    ).resolves.toBe(true);
  });

  it("persists through the shared Tauri keychain API and reuses the stored identity", async () => {
    const values = new Map<string, string>();
    const calls: Array<{
      command: string;
      args: Record<string, unknown> | undefined;
    }> = [];
    const invoke: TauriInvoke = async (command, args) => {
      calls.push({ command, args });
      const key = args?.key as
        | { service: string; scope: string; identifier: string }
        | undefined;
      const id = key
        ? `${key.service}:${key.scope}:${key.identifier}`
        : "";
      if (command === "platform_keychain_get") {
        return (values.get(id) ?? null) as never;
      }
      if (command === "platform_keychain_set") {
        values.set(id, String(args?.value));
        return undefined as never;
      }
      throw new Error(`unexpected keychain command: ${command}`);
    };
    const keychain = createTauriKeychainApi(invoke);
    const generateKeypair = vi.fn(async () => fixedKeypair);

    const first = await ensureAgentIntakeInstallSigningKeypair({
      isDesktopRuntime: () => true,
      loadKeychain: async () => keychain,
      generateKeypair,
    });
    const second = await ensureAgentIntakeInstallSigningKeypair({
      isDesktopRuntime: () => true,
      loadKeychain: async () => keychain,
      generateKeypair,
    });

    expect(first).toEqual(fixedKeypair);
    expect(second).toEqual(fixedKeypair);
    expect(generateKeypair).toHaveBeenCalledTimes(1);
    expect(calls.map((call) => call.command)).toEqual([
      "platform_keychain_get",
      "platform_keychain_set",
      "platform_keychain_get",
    ]);
    expect(calls[1]?.args).toMatchObject({
      key: intakeInstallSigningKeypairKey("agent-studio-open"),
      secret: true,
    });
  });
});
