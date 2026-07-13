import { describe, expect, it, vi } from "vitest";
import {
  artifactForKind,
  buildLocalExportBundle,
  deriveRuntimeOutputPath,
  downloadLocalArtifact,
  readStoredZipEntries,
  sha256Hex,
  type ExportEvidenceContext,
} from "../exportArtifacts";
import {
  buildExportBundle,
  demoCompareResult,
  demoReplayResult,
  traceSessions,
} from "../data";

const decoder = new TextDecoder();

describe("deterministic artifact exports", () => {
  const bundle = buildExportBundle(traceSessions);
  const context: ExportEvidenceContext = {
    generatedAt: "2026-05-12T09:42:30.000Z",
    sourceBuild: {
      product: "Agent Studio Open",
      version: "0.2.0",
      commit: "abc123",
      state: "dirty-uncommitted",
      sourceDigest: "source-digest",
    },
    sourceTrace: {
      id: traceSessions[0].id,
      path: "agentstudio-live.ast",
      content: bundle.sourceTrace,
    },
    replay: demoReplayResult,
    comparison: demoCompareResult,
  };

  it("matches the standard SHA-256 vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("builds the GitHub export as a real ZIP matching the CLI directory", async () => {
    const artifact = await artifactForKind(bundle, context, "gh-action");
    const entries = readStoredZipEntries(artifact.content);

    expect(artifact).toMatchObject({
      kind: "gh-action",
      filename: "agentstudio-github-action.zip",
      mediaType: "application/zip",
    });
    expect([...entries.keys()]).toEqual([
      ".github/workflows/agent-regression.yml",
      "regressions/trace-refund.json",
      "regressions/trace-refund.assertions.yaml",
      "README.md",
      "agentstudio-export-manifest.json",
    ]);
    expect(
      decoder.decode(entries.get(".github/workflows/agent-regression.yml")),
    ).toContain("name: Agent regression");
    expect(
      JSON.parse(
        decoder.decode(entries.get("agentstudio-export-manifest.json")),
      ),
    ).toMatchObject({
      schema: "agentstudio.export-evidence.v1",
      sourceTrace: {
        id: "trace-refund",
        path: "agentstudio-live.ast",
      },
      replay: { state: "review" },
      comparison: { state: "review" },
      artifact: { kind: "gh-action", format: "zip" },
    });
    expect(artifact.evidence.artifact.archiveSha256).toBe(
      sha256Hex(artifact.content),
    );
  });

  it("keeps JUnit, PR comment, and trace-card names and formats CLI-aligned", async () => {
    const junit = await artifactForKind(bundle, context, "junit");
    const prComment = await artifactForKind(bundle, context, "pr-comment");
    const traceCard = await artifactForKind(bundle, context, "trace-card");

    expect(junit.filename).toBe("junit.xml");
    expect(decoder.decode(junit.content)).toContain(
      '<testsuite name="agentstudio"',
    );
    expect(prComment.filename).toBe("agentstudio-pr-comment.md");
    expect(decoder.decode(prComment.content)).toContain(
      "<!-- agentstudio-trace-card -->",
    );
    expect(traceCard.filename).toBe("trace-card.json");
    expect(JSON.parse(decoder.decode(traceCard.content))).toMatchObject({
      schema_version: "agent-trace-card/v1",
      trace_id: "trace-refund",
      regression_status: "covered",
    });
    expect(traceCard.evidence.artifact.files[0].sha256).toBe(
      sha256Hex(traceCard.content),
    );
  });

  it("builds intake and the five-artifact bundle as real deterministic ZIPs", async () => {
    const intake = await artifactForKind(bundle, context, "intake");
    const intakeEntries = readStoredZipEntries(intake.content);
    expect([...intakeEntries.keys()]).toEqual([
      "trace.ast",
      "regressions/trace-refund.json",
      "regressions/trace-refund.assertions.yaml",
      "README.md",
      "agentstudio-export-manifest.json",
    ]);

    const artifact = await buildLocalExportBundle(bundle, context);
    const entries = readStoredZipEntries(artifact.content);
    expect(artifact.filename).toBe("agentstudio-export-bundle.zip");
    expect([...entries.keys()]).toEqual([
      "artifacts/agentstudio-github-action.zip",
      "artifacts/junit.xml",
      "artifacts/agentstudio-pr-comment.md",
      "artifacts/agentstudio-intake.zip",
      "artifacts/trace-card.json",
      "agentstudio-export-manifest.json",
    ]);
    const manifest = JSON.parse(
      decoder.decode(entries.get("agentstudio-export-manifest.json")),
    );
    expect(manifest.artifact.files).toHaveLength(5);
    expect(manifest.components.map((item: { artifact: { kind: string } }) => item.artifact.kind)).toEqual([
      "gh-action",
      "junit",
      "pr-comment",
      "intake",
      "trace-card",
    ]);
    expect(
      (await buildLocalExportBundle(bundle, context)).content,
    ).toEqual(artifact.content);
  });

  it("derives kind-correct desktop output paths", () => {
    expect(deriveRuntimeOutputPath("agentstudio-export.md", "gh-action")).toBe(
      "agentstudio-export-github-action",
    );
    expect(deriveRuntimeOutputPath("agentstudio-export.md", "junit")).toBe(
      "agentstudio-export-junit.xml",
    );
    expect(deriveRuntimeOutputPath("/tmp/release", "pr-comment")).toBe(
      "/tmp/release-pr-comment.md",
    );
    expect(deriveRuntimeOutputPath("/tmp/release", "intake")).toBe(
      "/tmp/release-intake.zip",
    );
    expect(deriveRuntimeOutputPath("/tmp/card.json", "trace-card")).toBe(
      "/tmp/card.json",
    );
    expect(deriveRuntimeOutputPath("/tmp/card.md", "trace-card")).toBe(
      "/tmp/card-trace-card.json",
    );
  });

  it("performs a real browser download and revokes its object URL", async () => {
    const createObjectURL = vi.fn(() => "blob:agentstudio-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadLocalArtifact(await artifactForKind(bundle, context, "junit"));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:agentstudio-export");
  });
});
