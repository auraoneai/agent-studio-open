import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const browserBase = process.env.AGENT_STUDIO_WEB_BASE ?? "/";
const outDir = process.env.AGENT_STUDIO_WEB_OUT_DIR ?? "dist";
const localModule = (path: string) =>
  fileURLToPath(new URL(`./node_modules/${path}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: browserBase,
  resolve: {
    alias: [
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: localModule("react/jsx-dev-runtime.js"),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: localModule("react/jsx-runtime.js"),
      },
      { find: /^react$/, replacement: localModule("react") },
      { find: /^react-dom$/, replacement: localModule("react-dom") },
    ],
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    port: 4319,
  },
  test: {
    testTimeout: 15000,
  },
});
