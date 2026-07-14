# Agent Studio Open

Agent Studio Open is AuraOne's MIT-licensed, local-first IDE for debugging,
replaying, comparing, and regression-testing AI agents that speak MCP and A2A.

It is designed for MCP server authors, agent-platform engineers, evaluation
teams, and security reviewers who need protocol evidence rather than a hosted
trace dashboard. Its differentiator is one desktop/browser/VS Code/CLI workflow
for endpoint discovery, trace inspection, deterministic replay, behavioral
comparison, risk review, and CI artifact export.

## Visual Workflow

![Agent Studio Open deterministic replay workspace with replay controls, trace context, assertions, and baseline-versus-candidate evidence](https://www.auraone.ai/open/agent-studio-open/screenshots/replay-run.webp)

The selected proof image matches the single product view used by the public
website route. Capture provenance is recorded in the
[AuraFoundry release evidence](https://github.com/gchahal1982/AuraFoundry/blob/main/docs/evidence/final-makeover/assets/open-source-capture-provenance.json).

## Daily Loop

1. Connect to a local stdio MCP server or a remote SSE / HTTP / WebSocket server.
2. Inspect tools, resources, prompts, raw manifests, logs, and risk findings.
3. Compose schema-backed requests and model inputs without fabricating a local
   tool result when the selected runtime does not expose execution.
4. Record a session into a portable `.ast` trace store.
5. Replay the same session deterministically with mocked tool outputs.
6. Compare model behavior across provider profiles, including custom model IDs.
7. Import OTEL GenAI spans or Phoenix JSON and convert failures to regressions.
8. Export GitHub Actions, JUnit XML, PR comments, trace cards, and AuraOne
   intake packets.
9. Register a typed custom trace adapter for proprietary community formats.

Agent Studio Open is not an orchestration framework and is not a hosted
observability backend. It is the local debug and regression surface for agents
built on other frameworks.

## Install And Quickstart

### Hosted Browser

Open [agentstudio.auraone.ai](https://agentstudio.auraone.ai/) for the browser
edition. It supports remote MCP/A2A work and local trace storage, but not stdio
or an OTLP receiver.

### Public Desktop Release

Download the signed and notarized macOS Apple silicon DMG from
[Agent Studio Open 0.2.0](https://github.com/auraoneai/agent-studio-open/releases/tag/v0.2.0).
Verify the downloaded artifact before opening it:

```bash
shasum -a 256 Agent.Studio.Open_0.2.0_aarch64.dmg
# 30adbf96b107eb221cce5e07514f4ead7ce32046253f89dd5692f77c52c578ca
```

The companion CLI is published independently on PyPI:

```bash
python -m pip install auraone-agent-studio-open==0.2.1
agentstudio --help
```

The JavaScript MCP manifest validator and release metadata companion is
published on npm:

```bash
npm install @auraone/agent-studio@0.2.1
npx @auraone/agent-studio validate ./manifest.json
```

The npm package does not bundle the visual application or Python runtime.
Version `0.2.2` is a tested follow-up candidate, not a public release. Continue
to pin `0.2.1` until npm serves the newer version and its registry tarball has
been verified.
Homebrew is not a verified `0.2.0` distribution channel.

### Source Checkout

```bash
git clone https://github.com/auraoneai/agent-studio-open.git
cd agent-studio-open
pnpm install
pnpm dev
```

Use Node.js `20.19.5` or newer. This `0.2.0` repository vendors the exact
shared AuraOne Open Studio source packages used by the application. A fresh
clone therefore installs without a sibling monorepo checkout. Vite prints the
browser URL.

### CLI Workflow Example

From an AuraFoundry source checkout:

```bash
agentstudio --json connect stdio --command python --arg opensource/agent-studio-cookbook/sample-servers/filesystem-risk/server.py
agentstudio risk-scan opensource/agent-studio-cookbook/sample-servers/filesystem-risk --format json --fail-on critical --out reports/risk.json
agentstudio import-trace opensource/agent-studio-open/cli/tests/fixtures/openai_events.jsonl --format openai --store /tmp/filesystem-smoke.ast
agentstudio export pr-comment /tmp/filesystem-smoke.ast --out reports/filesystem-smoke.md
agentstudio export gh-action opensource/agent-studio-open/cli/tests/fixtures/regressions --out reports/agent-regression
```

Desktop is required for stdio MCP and the local OTLP receiver. Browser edition
supports remote SSE / HTTP / WebSocket MCP, A2A card testing, trace import,
IndexedDB trace storage, passphrase-protected provider keys, and custom model
picker entries.

## Editions

| Edition | Purpose | Boundary |
| --- | --- | --- |
| Desktop | Full Tauri app with stdio, OTLP receiver, OS keychain, sandbox mode, and Python sidecar engines. | Primary OSS surface. |
| Browser | Remote MCP, A2A, trace import, replay, compare, and local browser storage. | No stdio and no OTLP receiver. |
| VS Code | Workspace MCP discovery, manifest inspector, compose webview, risk hovers, desktop deep links. | Editor companion, not a full IDE replacement. |
| CLI | Pipe-friendly `agentstudio` binary for connect, record, replay, compare, risk-scan, A2A, and export. | CI and automation surface. |

## Runtime, Data, And Network Boundary

- **Browser data:** imported traces and workspace state use local IndexedDB.
  Provider keys are passphrase-encrypted before browser persistence.
- **Desktop data:** traces and exports remain local files. Provider secrets use
  the OS keychain contract; stdio and OTLP stay behind the desktop boundary.
- **Network:** a connection is created only when the user selects a remote
  MCP/A2A endpoint, provider, model gateway, release/update action, or other
  explicit network command. Browser mode cannot open a local stdio process.
- **Telemetry:** telemetry is off by default and excludes prompts, tool inputs
  and outputs, trace payloads, provider keys, headers, and other protocol
  content. Local previews do not prove delivery.
- **Exports:** replay stores, JUnit, GitHub Actions, PR-comment text, trace
  cards, and intake packets are generated locally. Data leaves the machine only
  through an explicit connection, upload, or user-directed handoff.

## Interface System And Font Boundary

Agent Studio Open uses the OSS-safe Proofline interface contract through the
local `@auraone/aura-ide-kit` compatibility layer. The default experience is
light-first, uses system sans-serif typography with a system monospace stack,
keeps ordinary radii at 8px or less, and maps evidence states to explicit
success, info, review, warning, danger, and blocked colors. No remote font is
required to render the desktop, browser, or VS Code surfaces.

The desktop download action resolves to the stable GitHub latest-release page
by default. Release builds can set `VITE_AGENT_STUDIO_DESKTOP_RELEASE_URL` to a
signed distribution landing page without changing application source.

Private licensed font binaries are excluded from public source, npm metadata,
VSIX/CLI packages, and desktop release artifacts. The canonical hosted browser
loads licensed AuraOne typography through `/fonts/proofline-brand.css`, a
same-origin proxy to the marketing-site font boundary. If it is absent or
blocked, the system stacks remain the supported fallback. Capture tooling may
use an isolated temporary loopback font boundary, but it must never copy those
binaries into a public package.

## Proof And Verification

```bash
pnpm typecheck
pnpm test
pnpm test:a11y
pnpm build
pnpm desktop:check
pnpm test:capture-evidence
PYTHONPATH=cli/src python -m pytest -q cli/tests
```

The frontend suite covers protocol manifests, trace import, replay/compare,
keyboard and screen-reader behavior, IndexedDB/key handling, and evidence
exports. Rust and Python suites cover the desktop bridge, transports, OTLP,
trace stores, risk scanning, and CLI artifact generation.

The July 13, 2026 capture manifest preserves the original local-render
provenance. Public availability is established separately by the pushed release
commit, GitHub Release asset, registry package, checksum, notarization record,
and production browser deployment.

## Release Truth

Status verified on **July 13, 2026**:

- GitHub Release `agent-studio-open-v0.2.0` is public.
- `Agent.Studio.Open_0.2.0_aarch64.dmg` is signed, notarized, stapled,
  Gatekeeper accepted, checksum verified, and offline-install tested.
- `auraone-agent-studio-open 0.2.1` is public on PyPI for CLI workflows.
- `@auraone/agent-studio 0.2.1` is public on npm for MCP manifest validation
  and release metadata. The tested `0.2.2` candidate remains unpublished
  pending registry write authorization.
- The hosted browser edition is publicly reachable at
  `agentstudio.auraone.ai`.
- The npm package does not contain the root visual app. Homebrew, Windows,
  Linux, and automatic updater channels are not published for `0.2.0`.

## Documentation

- Product page: [auraone.ai/open/agent-studio-open](https://auraone.ai/open/agent-studio-open)
- Docs hub: [Agent Studio Open docs](https://auraone.ai/resources/docs/agent-studio-open)
- 60-second quickstart: [quickstart](https://auraone.ai/resources/docs/agent-studio-open/quickstart)
- MCP cookbook: [MCP cookbook](https://auraone.ai/resources/docs/agent-studio-open/mcp-cookbook)
- A2A cookbook: [A2A cookbook](https://auraone.ai/resources/docs/agent-studio-open/a2a-cookbook)
- OTEL cookbook: [OTEL cookbook](https://auraone.ai/resources/docs/agent-studio-open/otel-cookbook)
- CLI reference: [CLI reference](https://auraone.ai/resources/docs/agent-studio-open/cli-reference)
- Privacy: [privacy and telemetry](https://auraone.ai/resources/docs/agent-studio-open/privacy-telemetry)
- Sandbox: [sandbox](https://auraone.ai/resources/docs/agent-studio-open/sandbox)
- Troubleshooting: [troubleshooting](https://auraone.ai/resources/docs/agent-studio-open/troubleshooting)

## Local-First Privacy Posture

Trace contents stay on the user's machine unless the user explicitly connects
to a remote endpoint, exports a file for a user-directed handoff, or packages an
AuraOne intake packet. Telemetry is off by default and never includes prompts,
tool outputs, provider keys, headers, or trace payloads. Desktop provider keys
are stored through the OS keychain. Browser provider keys are stored as
passphrase-encrypted IndexedDB records and can be saved, verified, or removed
from Settings.

## Next Action

Use the hosted browser, verified `0.2.0` GitHub DMG, or PyPI CLI for released
behavior. Start with a non-sensitive fixture and a dry-run provider profile.
Treat Homebrew, Windows, Linux, and automatic updater paths as unavailable until
destination-specific evidence is published.

## License

MIT.
