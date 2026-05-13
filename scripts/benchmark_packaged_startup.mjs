#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(packageRoot, "../..");
const tauriRoot = path.join(packageRoot, "desktop", "src-tauri");
const probeFlag = "--benchmark-startup-probe";

const args = process.argv.slice(2);
const options = {
  build: !args.includes("--no-build"),
  json: args.includes("--json"),
  runs: numberOption("--runs", 5),
  limitMs: numberOption("--limit-ms", 2000),
};

if (options.runs < 1) {
  fail("--runs must be positive");
}

if (options.build) {
  run("pnpm", ["build"], { cwd: packageRoot, timeout: 120_000 });
  run("pnpm", ["exec", "tauri", "build", "--bundles", "app"], {
    cwd: packageRoot,
    timeout: 240_000,
  });
}

const executable = resolvePackagedExecutable();
const samples = [];
for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
  const started = performance.now();
  const result = spawnSync(executable, [probeFlag], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
  const elapsedMs = performance.now() - started;
  if (result.status !== 0) {
    fail(
      result.stderr || result.stdout || `startup probe failed: ${executable}`,
    );
  }
  if (!result.stdout.includes('"probe":"packaged-startup"')) {
    fail(`startup probe emitted unexpected output: ${result.stdout.trim()}`);
  }
  samples.push(elapsedMs);
}

const output = {
  executable: path.relative(repoRoot, executable),
  runs: options.runs,
  startup_ms_min: round(Math.min(...samples)),
  startup_ms_avg: round(
    samples.reduce((sum, value) => sum + value, 0) / samples.length,
  ),
  startup_ms_max: round(Math.max(...samples)),
  limit_ms: options.limitMs,
  passed: Math.max(...samples) <= options.limitMs,
};

if (options.json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(
    `packaged_executable=${output.executable} runs=${output.runs} startup_ms_min=${output.startup_ms_min} startup_ms_avg=${output.startup_ms_avg} startup_ms_max=${output.startup_ms_max} limit_ms=${output.limit_ms}`,
  );
}

if (!output.passed) {
  process.exit(1);
}

function numberOption(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const raw = args[index + 1];
  if (!raw) {
    fail(`${name} requires a value`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    fail(`${name} must be numeric`);
  }
  return parsed;
}

function run(command, commandArgs, spawnOptions) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: "pipe",
    ...spawnOptions,
  });
  if (result.status !== 0) {
    fail(
      result.stderr ||
        result.stdout ||
        `${command} ${commandArgs.join(" ")} failed`,
    );
  }
}

function resolvePackagedExecutable() {
  const platform = os.platform();
  const candidates =
    platform === "darwin"
      ? [
          path.join(
            tauriRoot,
            "target",
            "release",
            "bundle",
            "macos",
            "Agent Studio Open.app",
            "Contents",
            "MacOS",
            "agent-studio-open",
          ),
        ]
      : platform === "win32"
        ? [
            path.join(
              tauriRoot,
              "target",
              "release",
              "bundle",
              "msi",
              "agent-studio-open.exe",
            ),
            path.join(tauriRoot, "target", "release", "agent-studio-open.exe"),
          ]
        : [
            path.join(
              tauriRoot,
              "target",
              "release",
              "bundle",
              "appimage",
              "agent-studio-open.AppImage",
            ),
            path.join(tauriRoot, "target", "release", "agent-studio-open"),
          ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    fail(`no packaged executable found; checked ${candidates.join(", ")}`);
  }
  return found;
}

function round(value) {
  return Number(value.toFixed(3));
}

function fail(message) {
  console.error(`benchmark_packaged_startup: ${message}`);
  process.exit(2);
}
