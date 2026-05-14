import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const browserBase = process.env.AGENT_STUDIO_WEB_BASE ?? "/";
const outDir = process.env.AGENT_STUDIO_WEB_OUT_DIR ?? "dist";
const localNodeModules = (name: string) =>
  fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: browserBase,
  resolve: {
    alias: {
      "react/jsx-dev-runtime": fileURLToPath(
        new URL("./node_modules/react/jsx-dev-runtime.js", import.meta.url),
      ),
      "react/jsx-runtime": fileURLToPath(
        new URL("./node_modules/react/jsx-runtime.js", import.meta.url),
      ),
      react: localNodeModules("react"),
      "react-dom": localNodeModules("react-dom"),
    },
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
