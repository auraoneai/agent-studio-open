import type { Config } from "tailwindcss";

export default {
  content: ["./app/src/**/*.{ts,tsx}", "./web/src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        aura: {
          void: "var(--ag-void)",
          deep: "var(--ag-deep)",
          text: "var(--ag-text)",
          secondary: "var(--ag-text-secondary)",
          tertiary: "var(--ag-text-tertiary)",
          cyan: "var(--ag-cyan)",
          emerald: "var(--ag-emerald)",
          amber: "var(--ag-amber)",
          rose: "var(--ag-rose)",
          violet: "var(--ag-violet)",
        },
      },
      borderRadius: {
        "aura-xs": "var(--ag-radius-xs)",
        "aura-sm": "var(--ag-radius-sm)",
        "aura-md": "var(--ag-radius-md)",
        "aura-lg": "var(--ag-radius-lg)",
        "aura-xl": "var(--ag-radius-xl)",
      },
      boxShadow: {
        "aura-surface": "var(--ag-shadow-surface)",
        "aura-highlight": "var(--ag-shadow-highlight)",
      },
      fontFamily: {
        sans: "var(--ag-font-sans)",
        mono: "var(--ag-font-mono)",
      },
      transitionDuration: {
        "aura-fast": "var(--ag-duration-fast)",
        aura: "var(--ag-duration-normal)",
      },
      transitionTimingFunction: {
        aura: "var(--ag-easing-standard)",
      },
    },
  },
} satisfies Config;
