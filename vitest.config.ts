import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
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
  test: {
    globals: true,
    environment: "jsdom",
    testTimeout: 30000,
    include: [
      "app/src/**/*.test.ts",
      "app/src/**/*.test.tsx",
      "scripts/**/*.test.mjs",
    ],
    exclude: ["node_modules/**", "dist/**", "packages/**"],
  },
});
