import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const testingLibraryRequire = createRequire(require.resolve("@testing-library/react"));
const react = testingLibraryRequire.resolve("react");
const reactDom = testingLibraryRequire.resolve("react-dom");
const jsxRuntime = testingLibraryRequire.resolve("react/jsx-runtime");
const jsxDevRuntime = testingLibraryRequire.resolve("react/jsx-dev-runtime");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/, replacement: react },
      { find: /^react-dom$/, replacement: reactDom },
      { find: /^react\/jsx-runtime$/, replacement: jsxRuntime },
      { find: /^react\/jsx-dev-runtime$/, replacement: jsxDevRuntime },
    ],
    dedupe: ["react", "react-dom"],
  },
  test: {
    setupFiles: ["./tests/setup.ts"],
  },
});
