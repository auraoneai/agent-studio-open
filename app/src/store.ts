import { create } from "zustand";
import type { StudioState } from "./types";

export const initialStudioState: StudioState = {
  edition: "desktop",
  activeSurface: "connect",
  theme: "dark",
  commandPaletteOpen: false,
  firstRunOpen: true,
  recording: false,
  loadingOperation: null,
  errorMessage: null,
  selectedToolName: "refund_order",
  selectedTraceId: "trace-refund",
  selectedModels: ["claude-sonnet-4.7", "gpt-5.1"],
  search: "",
};

interface StudioStore {
  state: StudioState;
  setState: (updater: StudioState | ((current: StudioState) => StudioState)) => void;
}

export const useStudioStore = create<StudioStore>((set) => ({
  state: initialStudioState,
  setState: (updater) =>
    set((current) => ({
      state: typeof updater === "function" ? updater(current.state) : updater,
    })),
}));

export function resetStudioStore() {
  useStudioStore.setState({ state: initialStudioState });
}
