# @auraone/platform-contracts

`@auraone/platform-contracts` is the runtime-neutral TypeScript contract layer
for AuraOne Open Studio trust and release behavior. It lets browser, desktop,
CLI, and VS Code surfaces share the same schemas and validation rules without
coupling product code to a transport implementation.

**For:** platform and Studio engineers implementing telemetry, intake, updater,
keychain, crash, event-log, or extension boundaries.

**Differentiator:** endpoint declarations, privacy validation, and release
manifest shapes stay consistent across Rubric, Agent, and Robotics while each
consumer retains control of when and how a network or native capability runs.

## Install From The Current Source

Status verified on **July 13, 2026**: version `0.3.0` is a workspace candidate,
and `@auraone/platform-contracts` is not published on the public npm registry.
Use `workspace:*` or a local `file:` dependency.

From the `open-studio-platform` root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --dir packages/platform-contracts build
```

Only `dist/` and this README are included by the package allowlist.

## Contract Surface

- Canonical CSP, deep-link scheme, release channels, target platforms, and
  endpoint templates.
- Privacy-safe telemetry event creation and forbidden-payload validation.
- Local telemetry event-log states that distinguish preview from delivery.
- Crash and console-text scrubbing helpers.
- `.auraonepkg` intake roles, manifests, previews, and explicit upload-request
  construction.
- Keychain scopes, identifiers, and Tauri invoke adapters.
- Signed updater manifest, checksum, rollout, fallback, and kill-switch shapes.
- Robotics, MCP, OTLP, LLM-gateway, and other platform extension hooks.

## Usage

```ts
import {
  CANONICAL_CSP,
  createUpdaterEndpoint,
  validateTelemetryEvent,
  type UpdateManifest,
} from "@auraone/platform-contracts";

const endpoint = createUpdaterEndpoint("rubric-studio-open");
const manifest: UpdateManifest = await loadVerifiedManifest(endpoint);
const result = validateTelemetryEvent(candidateEvent);
```

The consumer must still authenticate, fetch, verify signatures, persist data,
and handle failure states. Types and helpers do not make those operations
trusted automatically.

## Runtime, Data, And Network Boundary

- The emitted package is plain ESM TypeScript output with no React or native
  runtime dependency.
- It does not create background workers, persist secrets, send telemetry,
  upload intake packets, fetch updates, or open sockets.
- Constants such as telemetry, intake, and update endpoints define the
  allowlisted contract. A product must make the explicit transport call and
  apply consent, redaction, authentication, signature, and error handling.
- Telemetry validation rejects content-like fields, paths, identifiers,
  prompts, rubric/sample/trace material, and common secret patterns.
- Keychain interfaces define approved scopes; only a host-provided Tauri invoke
  function can cross the native boundary.

## Font Boundary

This package contains no visual assets, CSS, or fonts. Private licensed font
binaries must never be added to its source or tarball. Studio UI consumers
follow Proofline's approved same-origin branded-stylesheet boundary and retain
the public system-font fallback.

## Proof

```bash
pnpm --dir packages/platform-contracts run type-check
pnpm --dir packages/platform-contracts build
node --test tests/platform-contracts.test.mjs
```

The root platform suite also exercises flagship integration, intake roles,
schema/privacy policy, security checklists, and release-flow contracts.

## Release Truth And Next Action

The repository fields identify the intended canonical package home, but they
are not registry evidence. Use the workspace build now. A public release
requires a reviewed `dist/` tarball, passing contract tests, npm provenance, and
a live registry page for the exact version before any `pnpm add` instruction is
supported.
