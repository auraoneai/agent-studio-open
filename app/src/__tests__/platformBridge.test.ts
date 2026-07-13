import { afterEach, describe, expect, it } from "vitest";
import {
  getRuntimeCapabilities,
  isTauriRuntime,
  loadPlatformKeychainApi,
  providerSecretMode,
} from "../platformBridge";
import { createInitialStudioState, useStudioStore } from "../store";

function clearTauriMarkers() {
  delete (window as Window & { __TAURI__?: unknown }).__TAURI__;
  delete (window as Window & { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
}

describe("Agent runtime capabilities", () => {
  afterEach(() => {
    clearTauriMarkers();
  });

  it("defaults ordinary browser builds to browser-only capabilities", async () => {
    clearTauriMarkers();

    expect(isTauriRuntime()).toBe(false);
    expect(getRuntimeCapabilities()).toEqual({
      edition: "browser",
      tauri: false,
      osKeychain: false,
      intakeSigning: false,
      localProcesses: false,
      localListeners: false,
    });
    expect(createInitialStudioState().edition).toBe("browser");
    useStudioStore.getState().setState({
      ...createInitialStudioState(),
      edition: "desktop",
    });
    expect(useStudioStore.getState().state.edition).toBe("browser");
    expect(providerSecretMode()).toBe("browser-vault");
    await expect(loadPlatformKeychainApi()).rejects.toThrow(
      "only inside the Tauri desktop runtime",
    );
  });

  it("reports desktop capabilities only when the Tauri runtime marker exists", () => {
    clearTauriMarkers();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });

    expect(isTauriRuntime()).toBe(true);
    expect(getRuntimeCapabilities()).toEqual({
      edition: "desktop",
      tauri: true,
      osKeychain: true,
      intakeSigning: true,
      localProcesses: true,
      localListeners: true,
    });
    expect(createInitialStudioState().edition).toBe("desktop");
    expect(providerSecretMode()).toBe("os-keychain");
  });
});
