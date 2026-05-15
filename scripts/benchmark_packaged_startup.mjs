#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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

const resolvedExecutable = resolvePackagedExecutable();
const executable = resolvedExecutable.executable;
const samples = [];
try {
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
} finally {
  resolvedExecutable.cleanup?.();
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
      ? darwinCandidates()
      : platform === "win32"
        ? windowsCandidates()
        : linuxCandidates();

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    if (platform === "darwin") {
      return mountDmgExecutable();
    }
    fail(`no packaged executable found; checked ${candidates.join(", ")}`);
  }
  return { executable: found };
}

function darwinCandidates() {
  return [
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
  ];
}

function windowsCandidates() {
  return [
    path.join(
      tauriRoot,
      "target",
      "release",
      "bundle",
      "msi",
      "agent-studio-open.exe",
    ),
    path.join(tauriRoot, "target", "release", "agent-studio-open.exe"),
  ];
}

function linuxCandidates() {
  return [
    ...bundleFiles("appimage", ".AppImage"),
    path.join(tauriRoot, "target", "release", "agent-studio-open"),
  ];
}

function bundleFiles(bundleDir, suffix) {
  const directory = path.join(tauriRoot, "target", "release", "bundle", bundleDir);
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(suffix))
    .sort()
    .map((entry) => path.join(directory, entry));
}

function mountDmgExecutable() {
  const [dmg] = bundleFiles("dmg", ".dmg");
  if (!dmg) {
    fail(
      `no packaged executable found; checked ${darwinCandidates().join(", ")} and no DMG was found`,
    );
  }
  const mountPoint = mkdtempSync(path.join(os.tmpdir(), "agent-studio-open-dmg-"));
  const attach = spawnSync(
    "hdiutil",
    ["attach", dmg, "-mountpoint", mountPoint, "-nobrowse", "-quiet"],
    { encoding: "utf8" },
  );
  if (attach.status !== 0) {
    rmSync(mountPoint, { recursive: true, force: true });
    fail(attach.stderr || attach.stdout || `failed to mount ${dmg}`);
  }
  const executable = path.join(
    mountPoint,
    "Agent Studio Open.app",
    "Contents",
    "MacOS",
    "agent-studio-open",
  );
  if (!existsSync(executable)) {
    cleanupDmgMount(mountPoint);
    fail(`mounted DMG does not contain expected executable: ${executable}`);
  }
  return {
    executable,
    cleanup: () => cleanupDmgMount(mountPoint),
  };
}

function cleanupDmgMount(mountPoint) {
  spawnSync("hdiutil", ["detach", mountPoint, "-quiet"], {
    encoding: "utf8",
  });
  rmSync(mountPoint, { recursive: true, force: true });
}

function round(value) {
  return Number(value.toFixed(3));
}

function fail(message) {
  console.error(`benchmark_packaged_startup: ${message}`);
  process.exit(2);
}
