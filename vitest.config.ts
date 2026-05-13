import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: resolve(workspaceRoot, "node_modules/.pnpm/react@18.3.1/node_modules/react"),
      "react-dom": resolve(workspaceRoot, "node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
