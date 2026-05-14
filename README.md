# Agent Studio Open

Agent Studio Open is AuraOne's MIT-licensed, local-first IDE for debugging,
replaying, comparing, and regression-testing AI agents that speak MCP and A2A.

It is designed for the daily loop of an MCP server author or agent-platform
engineer:

1. Connect to a local stdio MCP server or a remote SSE / HTTP / WebSocket server.
2. Inspect tools, resources, prompts, raw manifests, logs, and risk findings.
3. Compose schema-backed tool calls and model-driven agent loops.
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

## Quickstart

```bash
brew install auraoneai/open/agent-studio-open
agentstudio --json connect stdio --command python --arg opensource/agent-studio-cookbook/sample-servers/filesystem-risk/server.py
agentstudio risk-scan opensource/agent-studio-cookbook/sample-servers/filesystem-risk --format json --fail-on critical --out reports/risk.json
agentstudio import-trace opensource/agent-studio-open/cli/tests/fixtures/openai_events.jsonl --format openai --store /tmp/filesystem-smoke.ast
agentstudio export pr-comment /tmp/filesystem-smoke.ast --out reports/filesystem-smoke.md
agentstudio export gh-action opensource/agent-studio-open/cli/tests/fixtures/regressions --out reports/agent-regression
```

Desktop is required for stdio MCP and the local OTLP receiver. Browser edition
supports remote SSE / HTTP MCP, A2A card testing, trace import, IndexedDB trace
storage, passphrase-protected provider keys, and custom model picker entries.

## Editions

| Edition | Purpose | Boundary |
| --- | --- | --- |
| Desktop | Full Tauri app with stdio, OTLP receiver, OS keychain, sandbox mode, and Python sidecar engines. | Primary OSS surface. |
| Browser | Remote MCP, A2A, trace import, replay, compare, and local browser storage. | No stdio and no OTLP receiver. |
| VS Code | Workspace MCP discovery, manifest inspector, compose webview, risk hovers, desktop deep links. | Editor companion, not a full IDE replacement. |
| CLI | Pipe-friendly `agentstudio` binary for connect, record, replay, compare, risk-scan, A2A, and export. | CI and automation surface. |

## Documentation

- Product page: `/open/agent-studio-open`
- Docs hub: `/resources/docs/agent-studio-open`
- 60-second quickstart: `/resources/docs/agent-studio-open/quickstart`
- MCP cookbook: `/resources/docs/agent-studio-open/mcp-cookbook`
- A2A cookbook: `/resources/docs/agent-studio-open/a2a-cookbook`
- OTEL cookbook: `/resources/docs/agent-studio-open/otel-cookbook`
- CLI reference: `/resources/docs/agent-studio-open/cli-reference`
- Privacy: `/resources/docs/agent-studio-open/privacy-telemetry`
- Sandbox: `/resources/docs/agent-studio-open/sandbox`
- Troubleshooting: `/resources/docs/agent-studio-open/troubleshooting`

## Local-first privacy posture

Trace contents stay on the user's machine unless the user explicitly exports a
file, posts a PR comment, or packages an AuraOne intake packet. Telemetry is off
by default and never includes prompts, tool outputs, provider keys, headers, or
trace payloads. Desktop provider keys are stored through the OS keychain. Browser
provider keys are stored as passphrase-encrypted IndexedDB records and can be
saved, verified, or removed from Settings.

## License

MIT.
