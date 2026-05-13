import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const workspaceRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);
const browserBase = process.env.AGENT_STUDIO_WEB_BASE ?? "/";
const outDir = process.env.AGENT_STUDIO_WEB_OUT_DIR ?? "dist";

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: browserBase,
  resolve: {
    alias: {
      react: resolve(
        workspaceRoot,
        "node_modules/.pnpm/react@18.3.1/node_modules/react",
      ),
      "react-dom": resolve(
        workspaceRoot,
        "node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom",
      ),
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
