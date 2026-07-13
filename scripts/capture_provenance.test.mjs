// @vitest-environment node

import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  currentGitSourceState,
  digestDeclaredInputs,
  verifyDeclaredDigest,
} from "./capture_provenance.mjs";

const execFileAsync = promisify(execFile);

describe("capture provenance closure", () => {
  it("fails verification when a linked dependency source file changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentstudio-provenance-"));
    try {
      const app = join(root, "agent-studio-open");
      const linked = join(
        app,
        "packages",
        "platform-contracts",
        "src",
      );
      await mkdir(join(app, "app", "src"), { recursive: true });
      await mkdir(linked, { recursive: true });
      await writeFile(join(app, "app", "src", "App.tsx"), "export const app = 1;\n");
      await writeFile(join(linked, "index.ts"), "export const contract = 1;\n");
      const options = {
        baseDir: app,
        repositoryRoot: root,
        inputs: [
          "app/src",
          "packages/platform-contracts/src",
        ],
      };
      const recorded = await digestDeclaredInputs(options);

      await writeFile(join(linked, "index.ts"), "export const contract = 2;\n");

      await expect(verifyDeclaredDigest(recorded, options)).rejects.toThrow(
        "Declared source digest mismatch",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores deterministic generated junk but not real source", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentstudio-junk-"));
    try {
      const source = join(root, "source");
      await mkdir(join(source, "__pycache__"), { recursive: true });
      await mkdir(join(source, "package.egg-info"), { recursive: true });
      await mkdir(join(source, "coverage"), { recursive: true });
      await writeFile(join(source, "runtime.py"), "VALUE = 1\n");
      await writeFile(join(source, "__pycache__", "runtime.pyc"), "first");
      await writeFile(join(source, "package.egg-info", "PKG-INFO"), "first");
      await writeFile(join(source, "coverage", "coverage.json"), "first");
      await writeFile(join(source, ".DS_Store"), "first");
      const options = {
        baseDir: root,
        repositoryRoot: root,
        inputs: ["source"],
      };
      const original = await digestDeclaredInputs(options);

      await writeFile(join(source, "__pycache__", "runtime.pyc"), "second");
      await writeFile(join(source, "package.egg-info", "PKG-INFO"), "second");
      await writeFile(join(source, "coverage", "coverage.json"), "second");
      await writeFile(join(source, ".DS_Store"), "second");
      expect(await digestDeclaredInputs(options)).toBe(original);

      await writeFile(join(source, "runtime.py"), "VALUE = 2\n");
      expect(await digestDeclaredInputs(options)).not.toBe(original);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when any declared source path is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentstudio-missing-"));
    try {
      await expect(
        digestDeclaredInputs({
          baseDir: root,
          repositoryRoot: root,
          inputs: ["missing-linked-source"],
        }),
      ).rejects.toThrow("Missing provenance source path");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("includes linked dependency mutations in the source-change digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentstudio-git-state-"));
    try {
      await mkdir(join(root, "product"), { recursive: true });
      await mkdir(join(root, "linked"), { recursive: true });
      await writeFile(join(root, "product", "app.ts"), "export const app = 1;\n");
      await writeFile(join(root, "linked", "contract.ts"), "export const contract = 1;\n");
      await execFileAsync("git", ["init", "-q"], { cwd: root });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], {
        cwd: root,
      });
      await execFileAsync("git", ["config", "user.name", "Agent Studio Test"], {
        cwd: root,
      });
      await execFileAsync("git", ["add", "."], { cwd: root });
      await execFileAsync("git", ["commit", "-qm", "fixture"], { cwd: root });

      const options = {
        repositoryRoot: root,
        pathspecs: ["product", "linked"],
      };
      const clean = await currentGitSourceState(options);
      expect(clean.state).toBe("clean");

      await mkdir(join(root, "linked", "__pycache__"), { recursive: true });
      await writeFile(join(root, "linked", "__pycache__", "junk.pyc"), "junk");
      expect((await currentGitSourceState(options)).state).toBe("clean");

      await writeFile(join(root, "linked", "contract.ts"), "export const contract = 2;\n");
      const dirty = await currentGitSourceState(options);
      expect(dirty.state).toBe("dirty-uncommitted");
      expect(dirty.changeCount).toBe(1);
      expect(dirty.changeDigest).not.toBe(clean.changeDigest);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
