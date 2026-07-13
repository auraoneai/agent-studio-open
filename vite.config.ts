import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const browserBase = process.env.AGENT_STUDIO_WEB_BASE ?? "/";
const outDir = process.env.AGENT_STUDIO_WEB_OUT_DIR ?? "dist";

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: browserBase,
  resolve: {
    alias: [
      {
        find: "@auraone/aura-ide-kit/styles.css",
        replacement: resolve(appRoot, "packages/aura-ide-kit/src/styles.css"),
      },
      {
        find: "@auraone/proofline-oss/styles.css",
        replacement: resolve(appRoot, "packages/proofline-oss/src/styles.css"),
      },
      {
        find: "@auraone/proofline-oss/tokens.css",
        replacement: resolve(appRoot, "packages/proofline-oss/src/tokens.css"),
      },
      {
        find: /^@auraone\/platform-contracts$/,
        replacement: resolve(
          appRoot,
          "packages/platform-contracts/src/index.ts",
        ),
      },
      {
        find: /^@auraone\/aura-ide-kit$/,
        replacement: resolve(appRoot, "packages/aura-ide-kit/src/index.ts"),
      },
      {
        find: /^@auraone\/proofline-oss$/,
        replacement: resolve(appRoot, "packages/proofline-oss/src/index.ts"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    port: 4319,
  },
});
