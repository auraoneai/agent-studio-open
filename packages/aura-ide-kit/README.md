# Aura IDE Kit

`@auraone/aura-ide-kit` is the IDE-class React component layer shared by the
AuraOne Open Studios. It extends Proofline OSS with project trees, split panes,
Monaco, timelines, inspectors, command surfaces, evidence logs, settings, and
desktop-oriented state handling.

**For:** Studio maintainers who need a consistent desktop/browser IDE shell
without rebuilding complex interaction and accessibility behavior per product.

**Differentiator:** every export has an explicit SSR posture, and components
graduate into Proofline only after multi-product use proves a stable,
product-neutral public contract.

## Install

Status verified on **July 14, 2026**: version `0.2.1` is published on the
public npm registry. It replaces `0.2.0`, whose published manifest retained a
workspace-only dependency and cannot be installed outside the monorepo.

```bash
npm install @auraone/aura-ide-kit@0.2.1
```

For workspace development from the `open-studio-platform` root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --dir packages/aura-ide-kit build
```

The package allowlist contains `dist/`, `examples/`, and this README.

## SSR Posture

Every exported component is declared in `src/ssr-posture.ts` as `ssr-safe`,
`client-only`, or `client-only-with-suspense`.

- `AuraMonaco` is `client-only-with-suspense`.
- Static display primitives are `ssr-safe`.
- Shell, palette, resize, modal, toast, settings, and tab-selection surfaces
  are `client-only`.

Consumers should use the posture map rather than inferring SSR safety from a
component name.

## Source Of Truth

- Canonical public tokens and primitives:
  `packages/proofline-oss/`
- IDE component incubation:
  `packages/aura-ide-kit/`
- Compatibility boundary: legacy `--ag-*` aliases may support existing
  flagships, but new code uses Proofline semantic tokens.

Components graduate into Proofline OSS only after they are stable in at least
two flagships, have an accessible public contract, and can be supported without
product-specific assumptions.

## Components

- `AuraIdeAppFrame`
- `AuraSplitPane`
- `AuraProjectTree`
- `AuraMonaco`
- `AuraTimeline`
- `AuraInspector`
- `AuraCommandPalette`
- `AuraStatusBar`
- `AuraProblemsPanel`
- `AuraSettingsPanel`
- `AuraWelcomePrivacyWizard`
- `AuraUpdatePrompt`
- `AuraIntakeIdentityFields`
- `AuraKeychainFallbackWarning`
- `AuraToastProvider`
- `AuraModal`
- `AuraEmptyState`, `AuraLoadingState`, `AuraErrorState`
- `AuraTelemetryEventLog`
- `AuraIntakePacketPreview`
- `AuraFileWatcherStatus`
- `AuraWelcomeWindow`
- `AuraTabbedShell`

## Usage

```tsx
import {
  AuraIdeAppFrame,
  AuraCommandPalette,
  createCommandRegistry,
} from "@auraone/aura-ide-kit";
import "@auraone/aura-ide-kit/styles.css";

const registry = createCommandRegistry();
registry.register({
  id: "project.open-folder",
  title: "Open Folder",
  group: "Project",
  keybinding: "Mod+O",
  handler: () => openFolder(),
});
```

## Runtime, Data, And Network Boundary

- The supported peer runtime is React and React DOM `18.3.1`.
- Monaco and shell interactions require a browser-like client runtime;
  consumers remain responsible for suspense and client boundaries.
- The package renders UI and invokes consumer callbacks. It does not own
  product persistence, provider calls, file uploads, telemetry delivery,
  updater transport, or keychain storage.
- Product links and intake/privacy surfaces are declarations and user actions,
  not an ambient backend connection.

## Font And Asset Boundary

Aura IDE Kit inherits Proofline's public-asset contract. It ships no private
licensed font binary and requires no remote font request. Public packages use
system fallbacks. An authorized branded deployment may provide licensed
typography only through a host-owned stylesheet on an approved same-origin
path; failure to load it must fall back cleanly to the public system stacks.
Temporary loopback font delivery is permitted only for isolated capture
verification and never for package contents.

## Proof

```bash
pnpm --dir packages/aura-ide-kit typecheck
pnpm --dir packages/aura-ide-kit test
pnpm --dir packages/aura-ide-kit build
```

Tests cover component contracts, command registration, focus and keyboard
behavior, accessible semantics, and the SSR posture inventory. The built
tarball surface is limited by the package `files` allowlist.

## Release Truth

The public `0.2.1` package passes typecheck, component tests, accessibility
checks, SSR-posture verification, packed-file inspection, registry readback,
and a clean external install. Its Proofline dependency resolves to the public
`@auraone/proofline-oss` `0.1.x` release line.
