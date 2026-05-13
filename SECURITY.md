# Security Policy

Report suspected vulnerabilities privately to `security@auraone.ai`.

Do not open public issues for credential leaks, MCP server escapes, model-key
exposure, update bypasses, telemetry disclosure, intake-packet privacy leaks,
trace replay parser bugs, OTLP receiver issues, sidecar crashes, or signing
failures.

Include:

- Affected version or commit.
- Component: desktop shell, MCP transport, OTLP receiver, model gateway,
  keychain, telemetry, crash reporting, intake packet, sidecar, browser
  edition, VS Code companion, CLI, updater, installer, or package registry.
- Reproduction steps or proof of concept.
- Impact assessment and whether active exploitation is known.

## Security Posture

- Telemetry and crash reporting are off by default.
- Prompt, completion, scratchpad, tool output, environment variable, clipboard,
  provider key, MCP credential, connection string, trace payload, and server URL
  contents are excluded from telemetry and crash reports.
- Desktop provider keys and MCP credentials are stored through the shared Open
  Studio Platform keychain abstraction.
- Browser edition does not support stdio MCP or the local OTLP receiver.
- AuraOne intake export is explicit user action only and must show a preview.

## Permission Review

Agent Studio Open's tracked Tauri capability manifest currently requests:

| Permission | Purpose | Review decision |
|---|---|---|
| `core:default` | Required Tauri core window/runtime behavior. | Approved as base desktop shell permission. |
| `dialog:default` | User-selected trace, MCP manifest, project, import, and export prompts. | Approved only for explicit user selection. |
| `notification:default` | Local status notifications for long-running replays/imports. | Approved for local desktop feedback only. |
| `os:default` | Reads platform metadata for diagnostics and compatibility checks. | Approved when excluded from telemetry payload content. |
| `process:default` | Runs pinned MCP/sidecar subprocesses. | Approved only with bounded lifecycle controls and no arbitrary shell exposure. |
| `clipboard-manager:default` | Copies user-requested trace cards, commands, and diagnostics. | Approved for explicit copy actions only. |
| `deep-link:default` | Handles `auraone://agent-studio/open` links. | Approved for desktop handoff and VS Code companion flows. |
| `updater:default` | Checks signed platform update manifests. | Approved only with signed-manifest verification. |
| `fs:scope`, `fs:allow-*` | Reads/writes local traces, manifests, exports, app data, and selected project files. | Approved only for user-selected files plus app data; no hidden credential export. |

The manifest intentionally excludes Tauri shell permissions and arbitrary remote
HTTP execution permissions. MCP network connections are controlled by the app's
protocol surfaces and the reviewed CSP.

## Network Destinations

The desktop CSP currently allows:

| Destination | Purpose | Default |
|---|---|---|
| `updates.auraone.ai`, `updates2.auraone.ai` | Signed update checks. | Release-channel dependent. |
| `intake.auraone.ai` | Explicit AuraOne intake export. | Off until user sends. |
| `o.auraone.ai` | Opt-in telemetry. | Off by default. |
| `sentry.io` | Opt-in crash reporting. | Off by default. |
| `127.0.0.1`, `localhost`, local WebSocket endpoints | Local MCP/OTLP/sidecar development and replay flows. | User-configured. |
| `wss:` | Remote MCP/WebSocket servers. | User-configured and subject to connector review. |

Provider and MCP credentials must not be embedded in URLs or telemetry payloads.

## Supported Versions

The initial supported line is `0.1.x`.
