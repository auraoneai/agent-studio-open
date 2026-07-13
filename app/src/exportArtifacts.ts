import type {
  ComparisonEvidence,
  ExportBundle,
  ReplayEvidence,
} from "./types";

export type ArtifactExportKind =
  | "gh-action"
  | "junit"
  | "pr-comment"
  | "intake"
  | "trace-card";

export type ExportOperationKey = ArtifactExportKind | "bundle";

export interface ExportBuildProvenance {
  product: "Agent Studio Open";
  version: string;
  commit: string;
  state: string;
  sourceDigest: string;
}

export interface ExportEvidenceContext {
  generatedAt: string;
  sourceBuild: ExportBuildProvenance;
  sourceTrace: {
    id: string;
    path: string;
    content: string;
  };
  replay: ReplayEvidence | null;
  comparison: ComparisonEvidence | null;
}

export interface ExportEvidenceFile {
  path: string;
  format: string;
  mediaType: string;
  bytes: number;
  sha256: string;
}

export interface ExportEvidenceContract {
  schema: "agentstudio.export-evidence.v1";
  generatedAt: string;
  sourceBuild: ExportBuildProvenance;
  sourceTrace: {
    id: string;
    path: string;
    sha256: string;
  };
  replay: {
    state: "not-run" | ReplayEvidence["status"];
    result: ReplayEvidence | null;
  };
  comparison: {
    state: "not-run" | "passed" | "review" | "failed";
    result: ComparisonEvidence | null;
  };
  destination: {
    mode: "browser-download";
    path: string;
  };
  artifact: {
    kind: ExportOperationKey;
    filename: string;
    format: string;
    mediaType: string;
    sha256: string;
    archiveSha256?: string;
    files: ExportEvidenceFile[];
  };
  components?: ExportEvidenceContract[];
}

export interface LocalArtifact {
  kind: ExportOperationKey;
  filename: string;
  mediaType: string;
  content: Uint8Array;
  evidence: ExportEvidenceContract;
}

export interface ExportArtifactDefinition {
  kind: ArtifactExportKind;
  title: string;
  caption: string;
  filename: string;
  mediaType: string;
  format: string;
  inputRequirement: string;
  bundleKey: keyof Pick<
    ExportBundle,
    "workflow" | "junit" | "prComment" | "intakeManifest" | "traceCard"
  >;
}

interface ArchiveInput {
  path: string;
  mediaType: string;
  format: string;
  content: string | Uint8Array;
}

interface ArchiveFile extends Omit<ArchiveInput, "content"> {
  bytes: Uint8Array;
}

const textEncoder = new TextEncoder();
const evidenceManifestName = "agentstudio-export-manifest.json";

export const exportArtifactDefinitions: ExportArtifactDefinition[] = [
  {
    kind: "gh-action",
    title: "GitHub Action",
    caption: ".github/workflows/agent-regression.yml + regressions/",
    filename: "agentstudio-github-action.zip",
    mediaType: "application/zip",
    format: "zip",
    inputRequirement: "Regression suite directory",
    bundleKey: "workflow",
  },
  {
    kind: "junit",
    title: "JUnit",
    caption: "junit.xml",
    filename: "junit.xml",
    mediaType: "application/xml;charset=utf-8",
    format: "junit-xml",
    inputRequirement: "Assertion results JSON",
    bundleKey: "junit",
  },
  {
    kind: "pr-comment",
    title: "PR comment",
    caption: "agentstudio-pr-comment.md",
    filename: "agentstudio-pr-comment.md",
    mediaType: "text/markdown;charset=utf-8",
    format: "markdown",
    inputRequirement: "Trace store (.ast)",
    bundleKey: "prComment",
  },
  {
    kind: "intake",
    title: "AuraOne intake",
    caption: "agentstudio-intake.zip",
    filename: "agentstudio-intake.zip",
    mediaType: "application/zip",
    format: "zip",
    inputRequirement: "Trace store (.ast)",
    bundleKey: "intakeManifest",
  },
  {
    kind: "trace-card",
    title: "Trace card",
    caption: "trace-card.json",
    filename: "trace-card.json",
    mediaType: "application/json;charset=utf-8",
    format: "agent-trace-card-json",
    inputRequirement: "Trace JSON",
    bundleKey: "traceCard",
  },
];

export async function artifactForKind(
  bundle: ExportBundle,
  context: ExportEvidenceContext,
  kind: ArtifactExportKind,
): Promise<LocalArtifact> {
  const definition = definitionForKind(kind);
  const payloadFiles = artifactPayloadFiles(bundle, context, kind);
  const evidence = buildEvidenceContract(
    context,
    kind,
    definition.filename,
    definition.format,
    definition.mediaType,
    payloadFiles,
  );

  if (kind === "gh-action" || kind === "intake") {
    const manifest = `${JSON.stringify(evidence, null, 2)}\n`;
    const content = createStoredZip(
      [
        ...payloadFiles,
        {
          path: evidenceManifestName,
          mediaType: "application/json",
          format: "agentstudio-export-evidence",
          content: manifest,
        },
      ],
      context.generatedAt,
    );
    const archiveSha256 = sha256Hex(content);
    return {
      kind,
      filename: definition.filename,
      mediaType: definition.mediaType,
      content,
      evidence: {
        ...evidence,
        artifact: { ...evidence.artifact, archiveSha256 },
      },
    };
  }

  const content = toBytes(payloadFiles[0]?.content ?? "");
  return {
    kind,
    filename: definition.filename,
    mediaType: definition.mediaType,
    content,
    evidence,
  };
}

export async function buildLocalExportBundle(
  bundle: ExportBundle,
  context: ExportEvidenceContext,
): Promise<LocalArtifact> {
  const components = await Promise.all(
    exportArtifactDefinitions.map((definition) =>
      artifactForKind(bundle, context, definition.kind),
    ),
  );
  const payloadFiles: ArchiveInput[] = components.map((artifact) => ({
    path: `artifacts/${artifact.filename}`,
    mediaType: artifact.mediaType.split(";")[0],
    format: artifact.evidence.artifact.format,
    content: artifact.content,
  }));
  const filename = "agentstudio-export-bundle.zip";
  const evidence = {
    ...buildEvidenceContract(
      context,
      "bundle",
      filename,
      "zip",
      "application/zip",
      payloadFiles,
    ),
    components: components.map((artifact) => artifact.evidence),
  };
  const content = createStoredZip(
    [
      ...payloadFiles,
      {
        path: evidenceManifestName,
        mediaType: "application/json",
        format: "agentstudio-export-evidence",
        content: `${JSON.stringify(evidence, null, 2)}\n`,
      },
    ],
    context.generatedAt,
  );
  const archiveSha256 = sha256Hex(content);
  return {
    kind: "bundle",
    filename,
    mediaType: "application/zip",
    content,
    evidence: {
      ...evidence,
      artifact: { ...evidence.artifact, archiveSha256 },
    },
  };
}

export function downloadLocalArtifact(artifact: LocalArtifact): void {
  const start = artifact.content.byteOffset;
  const end = start + artifact.content.byteLength;
  const body = artifact.content.buffer.slice(start, end) as ArrayBuffer;
  const blob = new Blob([body], { type: artifact.mediaType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = artifact.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

export function deriveRuntimeOutputPath(
  requestedOutput: string,
  kind: ArtifactExportKind,
): string {
  const trimmed = requestedOutput.trim();
  const base = trimmed || "agentstudio-export";
  const withoutTrailingSlash = base.replace(/[\\/]+$/, "");
  const stem = withoutTrailingSlash.replace(/\.[^./\\]+$/, "");
  const suffixes: Record<ArtifactExportKind, string> = {
    "gh-action": "github-action",
    junit: "junit.xml",
    "pr-comment": "pr-comment.md",
    intake: "intake.zip",
    "trace-card": "trace-card.json",
  };
  if (kind === "trace-card" && /\.json$/i.test(base)) {
    return base;
  }
  return `${stem}-${suffixes[kind]}`;
}

export function runtimeExportFormat(
  kind: ArtifactExportKind,
): string | undefined {
  return kind === "trace-card" ? "json" : undefined;
}

export function readStoredZipEntries(
  archive: Uint8Array,
): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  let offset = 0;
  while (offset + 4 <= archive.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }
    if (signature !== 0x04034b50 || offset + 30 > archive.byteLength) {
      throw new Error("Invalid ZIP local file header.");
    }
    const method = view.getUint16(offset + 8, true);
    if (method !== 0) {
      throw new Error("Only stored ZIP entries are supported.");
    }
    const compressedSize = view.getUint32(offset + 18, true);
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + filenameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.byteLength) {
      throw new Error("ZIP entry exceeds the archive boundary.");
    }
    const name = new TextDecoder().decode(
      archive.subarray(nameStart, nameStart + filenameLength),
    );
    entries.set(name, archive.slice(dataStart, dataEnd));
    offset = dataEnd;
  }
  return entries;
}

export function sha256Hex(content: string | Uint8Array): string {
  const input = toBytes(content);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = paddedView.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(words[index - 15], 7) ^
        rotateRight(words[index - 15], 18) ^
        (words[index - 15] >>> 3);
      const s1 =
        rotateRight(words[index - 2], 17) ^
        rotateRight(words[index - 2], 19) ^
        (words[index - 2] >>> 10);
      words[index] =
        (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 =
        (h + sum1 + choice + sha256Constants[index] + words[index]) >>> 0;
      const sum0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

function definitionForKind(kind: ArtifactExportKind): ExportArtifactDefinition {
  const definition = exportArtifactDefinitions.find(
    (item) => item.kind === kind,
  );
  if (!definition) {
    throw new Error(`Unsupported export kind: ${kind}`);
  }
  return definition;
}

function artifactPayloadFiles(
  bundle: ExportBundle,
  context: ExportEvidenceContext,
  kind: ArtifactExportKind,
): ArchiveInput[] {
  const traceId = safeFilename(context.sourceTrace.id);
  switch (kind) {
    case "gh-action":
      return [
        {
          path: ".github/workflows/agent-regression.yml",
          mediaType: "text/yaml",
          format: "github-actions-workflow",
          content: bundle.workflow,
        },
        {
          path: `regressions/${traceId}.json`,
          mediaType: "application/json",
          format: "tool-call-replay",
          content: bundle.regressionReplay,
        },
        {
          path: `regressions/${traceId}.assertions.yaml`,
          mediaType: "text/yaml",
          format: "tool-call-replay-assertions",
          content: bundle.regressionAssertions,
        },
        {
          path: "README.md",
          mediaType: "text/markdown",
          format: "markdown",
          content: bundle.regressionReadme,
        },
      ];
    case "junit":
      return [
        {
          path: "junit.xml",
          mediaType: "application/xml",
          format: "junit-xml",
          content: bundle.junit,
        },
      ];
    case "pr-comment":
      return [
        {
          path: "agentstudio-pr-comment.md",
          mediaType: "text/markdown",
          format: "markdown",
          content: bundle.prComment,
        },
      ];
    case "intake":
      return [
        {
          path: "trace.ast",
          mediaType: "application/octet-stream",
          format: "agentstudio-trace-store",
          content: bundle.sourceTrace,
        },
        {
          path: `regressions/${traceId}.json`,
          mediaType: "application/json",
          format: "tool-call-replay",
          content: bundle.regressionReplay,
        },
        {
          path: `regressions/${traceId}.assertions.yaml`,
          mediaType: "text/yaml",
          format: "tool-call-replay-assertions",
          content: bundle.regressionAssertions,
        },
        {
          path: "README.md",
          mediaType: "text/markdown",
          format: "markdown",
          content: bundle.intakeReadme,
        },
      ];
    case "trace-card":
      return [
        {
          path: "trace-card.json",
          mediaType: "application/json",
          format: "agent-trace-card-json",
          content: bundle.traceCard,
        },
      ];
  }
}

function buildEvidenceContract(
  context: ExportEvidenceContext,
  kind: ExportOperationKey,
  filename: string,
  format: string,
  mediaType: string,
  files: ArchiveInput[],
): ExportEvidenceContract {
  const normalizedFiles = files.map(normalizeArchiveFile);
  const fileEvidence = normalizedFiles.map((file) => ({
    path: file.path,
    format: file.format,
    mediaType: file.mediaType,
    bytes: file.bytes.byteLength,
    sha256: sha256Hex(file.bytes),
  }));
  return {
    schema: "agentstudio.export-evidence.v1",
    generatedAt: context.generatedAt,
    sourceBuild: context.sourceBuild,
    sourceTrace: {
      id: context.sourceTrace.id,
      path: context.sourceTrace.path,
      sha256: sha256Hex(context.sourceTrace.content),
    },
    replay: {
      state: context.replay?.status ?? "not-run",
      result: context.replay,
    },
    comparison: {
      state: comparisonState(context.comparison),
      result: context.comparison,
    },
    destination: {
      mode: "browser-download",
      path: filename,
    },
    artifact: {
      kind,
      filename,
      format,
      mediaType: mediaType.split(";")[0],
      sha256: digestArchiveFiles(normalizedFiles),
      files: fileEvidence,
    },
  };
}

function comparisonState(
  comparison: ComparisonEvidence | null,
): ExportEvidenceContract["comparison"]["state"] {
  if (!comparison) {
    return "not-run";
  }
  if (
    comparison.summary.some((summary) => summary.failed > 0) ||
    comparison.rows.some((row) =>
      row.values.some((value) => value.verdict === "fail"),
    )
  ) {
    return "failed";
  }
  if (
    comparison.summary.some((summary) => summary.review > 0) ||
    comparison.rows.some((row) =>
      row.values.some((value) => value.verdict === "review"),
    )
  ) {
    return "review";
  }
  return "passed";
}

function digestArchiveFiles(files: ArchiveFile[]): string {
  const chunks: Uint8Array[] = [];
  for (const file of files) {
    chunks.push(textEncoder.encode(`${file.path}\0`), file.bytes, new Uint8Array([0]));
  }
  return sha256Hex(concatBytes(chunks));
}

function createStoredZip(
  inputs: ArchiveInput[],
  generatedAt: string,
): Uint8Array {
  const files = inputs.map(normalizeArchiveFile);
  const { time, date } = dosDateTime(generatedAt);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = textEncoder.encode(file.path.replaceAll("\\", "/"));
    const checksum = crc32(file.bytes);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, file.bytes.byteLength, true);
    localView.setUint32(22, file.bytes.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    localView.setUint16(28, 0, true);
    localParts.push(localHeader, name, file.bytes);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, file.bytes.byteLength, true);
    centralView.setUint32(24, file.bytes.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.byteLength + name.byteLength + file.bytes.byteLength;
  }

  const localData = concatBytes(localParts);
  const centralData = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralData.byteLength, true);
  endView.setUint32(16, localData.byteLength, true);
  endView.setUint16(20, 0, true);
  return concatBytes([localData, centralData, end]);
}

function normalizeArchiveFile(input: ArchiveInput): ArchiveFile {
  return {
    path: input.path.replaceAll("\\", "/"),
    mediaType: input.mediaType,
    format: input.format,
    bytes: toBytes(input.content),
  };
}

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? textEncoder.encode(content) : content;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

function safeFilename(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized || "trace-empty";
}

function dosDateTime(value: string): { time: number; date: number } {
  const parsed = new Date(value);
  const dateValue = Number.isNaN(parsed.getTime())
    ? new Date("1980-01-01T00:00:00.000Z")
    : parsed;
  const year = Math.min(2107, Math.max(1980, dateValue.getUTCFullYear()));
  return {
    time:
      (dateValue.getUTCHours() << 11) |
      (dateValue.getUTCMinutes() << 5) |
      Math.floor(dateValue.getUTCSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((dateValue.getUTCMonth() + 1) << 5) |
      dateValue.getUTCDate(),
  };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

const crc32Table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const sha256Constants = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
  0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
  0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
  0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
