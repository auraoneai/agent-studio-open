import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ignoredDirectoryNames = new Set([
  ".cache",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".turbo",
  ".vite",
  "__pycache__",
  "build",
  "captures",
  "coverage",
  "dist",
  "htmlcov",
  "node_modules",
  "target",
]);

const ignoredFileNames = new Set([
  ".DS_Store",
  ".coverage",
  ".eslintcache",
  "CACHEDIR.TAG",
  "coverage-final.json",
  "lcov.info",
]);

export async function digestDeclaredInputs({
  baseDir,
  repositoryRoot,
  inputs,
}) {
  const files = await collectDeclaredFiles({ baseDir, inputs });
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(repositoryRoot, file).split(sep).join("/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function collectDeclaredFiles({ baseDir, inputs }) {
  const files = [];
  for (const input of inputs) {
    const absolute = resolve(baseDir, input);
    let info;
    try {
      info = await stat(absolute);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(`Missing provenance source path: ${input}`);
      }
      throw error;
    }
    if (info.isDirectory()) {
      await collectDirectoryFiles(absolute, files, absolute);
    } else if (info.isFile() && !isIgnoredGeneratedPath(absolute)) {
      files.push(absolute);
    }
  }
  const unique = [...new Set(files)].sort();
  if (unique.length === 0) {
    throw new Error("Provenance source set is empty");
  }
  return unique;
}

export async function verifyDeclaredDigest(expected, options) {
  const current = await digestDeclaredInputs(options);
  if (current !== expected) {
    throw new Error(
      `Declared source digest mismatch: expected ${expected}, received ${current}`,
    );
  }
  return current;
}

export async function currentGitSourceState({
  repositoryRoot,
  pathspecs,
  excludePathspecs = [],
}) {
  const { stdout: commitOutput } = await execFileAsync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: repositoryRoot },
  );
  const statusArgs = [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...pathspecs,
    ...excludePathspecs.map((pathspec) => `:(exclude)${pathspec}`),
  ];
  const { stdout: statusOutput } = await execFileAsync("git", statusArgs, {
    cwd: repositoryRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  const changes = statusOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !statusLineIsGeneratedJunk(line))
    .sort();
  return {
    baseSourceCommit: commitOutput.trim(),
    state: changes.length > 0 ? "dirty-uncommitted" : "clean",
    changeCount: changes.length,
    changeDigest: sha256(changes.join("\n")),
  };
}

export function isIgnoredGeneratedPath(pathValue) {
  const normalized = String(pathValue).split("\\").join("/");
  const parts = normalized.split("/").filter(Boolean);
  const filename = parts.at(-1) ?? "";
  if (
    ignoredDirectoryNames.has(filename) ||
    filename.endsWith(".egg-info") ||
    parts
      .slice(0, -1)
      .some(
        (part) =>
          ignoredDirectoryNames.has(part) || part.endsWith(".egg-info"),
      )
  ) {
    return true;
  }
  return (
    ignoredFileNames.has(filename) ||
    filename.endsWith(".pyc") ||
    filename.endsWith(".pyo") ||
    filename.endsWith(".tsbuildinfo")
  );
}

async function collectDirectoryFiles(directory, files, declaredRoot) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const relativePath = relative(declaredRoot, absolute);
    if (isIgnoredGeneratedPath(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      await collectDirectoryFiles(absolute, files, declaredRoot);
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
}

function statusLineIsGeneratedJunk(line) {
  const paths = line
    .slice(3)
    .split(" -> ")
    .map((pathValue) => pathValue.replace(/^"|"$/g, ""));
  return paths.length > 0 && paths.every(isIgnoredGeneratedPath);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
