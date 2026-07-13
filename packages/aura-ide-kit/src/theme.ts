import { createContext, useContext } from "react";
import type { AuraThemeMode } from "./types";

export type AuraThemeContextValue = {
  mode: AuraThemeMode;
  setMode: (mode: AuraThemeMode) => void;
};

export const AuraThemeContext = createContext<AuraThemeContextValue>({
  mode: "system",
  setMode: () => undefined,
});

export function useAuraTheme(): AuraThemeContextValue {
  return useContext(AuraThemeContext);
}
