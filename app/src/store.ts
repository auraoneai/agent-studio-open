import { create } from "zustand";
import { initialProviderKeys } from "./data";
import { getRuntimeCapabilities } from "./platformBridge";
import type { StudioState } from "./types";

export function createInitialStudioState(): StudioState {
  return {
    edition: getRuntimeCapabilities().edition,
    activeSurface: "connect",
    theme: "light",
    commandPaletteOpen: false,
    firstRunOpen: true,
    recording: false,
    loadingOperation: null,
    errorMessage: null,
    selectedToolName: "refund_order",
    selectedTraceId: "trace-refund",
    selectedModels: ["claude-opus-4-7", "gpt-5.5"],
    customModelId: "",
    providerKeys: initialProviderKeys,
    search: "",
  };
}

export const initialStudioState = createInitialStudioState();

interface StudioStore {
  state: StudioState;
  setState: (updater: StudioState | ((current: StudioState) => StudioState)) => void;
}

export const useStudioStore = create<StudioStore>((set) => ({
  state: createInitialStudioState(),
  setState: (updater) =>
    set((current) => {
      const next =
        typeof updater === "function" ? updater(current.state) : updater;
      const edition = getRuntimeCapabilities().edition;
      if (next === current.state && next.edition === edition) {
        return current;
      }
      return {
        state: next.edition === edition ? next : { ...next, edition },
      };
    }),
}));

export function resetStudioStore() {
  useStudioStore.setState({ state: createInitialStudioState() });
}
