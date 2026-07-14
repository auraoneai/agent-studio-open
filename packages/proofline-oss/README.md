# @auraone/proofline-oss

Proofline OSS is the public-safe React foundation for evidence-heavy AuraOne
Open interfaces. It gives product and platform engineers accessible actions,
forms, navigation, data views, overlays, and audit/evidence primitives without
shipping private brand assets or product-specific workflow logic.

**For:** teams building local-first review, evaluation, agent-debugging, or
governance tools that need dense IDE ergonomics and explicit evidence states.

**Differentiator:** every state is expressed with text and semantics, not color
alone; charts require a table alternative; and public-asset policy is enforced
by a package scanner.

## Install

Status verified on **July 14, 2026**: version `0.1.1` is published on the
public npm registry.

```bash
npm install @auraone/proofline-oss@0.1.1
```

For workspace development from the `open-studio-platform` root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --dir packages/proofline-oss build
```

Current monorepo consumers use `workspace:*`; sibling Studio repositories use a
local `file:` dependency. The package allowlist contains only `dist/` and this
README.

## Usage

```tsx
import "@auraone/proofline-oss/styles.css";
import {
  ProoflineAppShell,
  ProoflineButton,
  ProoflineEvidencePacket,
  ProoflineStatus,
} from "@auraone/proofline-oss";
```

The package is light-first. Dark styling is bounded to code and media regions
through `.pl-bounded-dark`.

## Component Contract

- Actions: button, link button, icon button, button group, and menu button.
- Forms: field, input, select, text area, checkbox, switch, and file picker.
- Navigation: breadcrumbs, tabs, segmented control, menu, and command palette.
- Surfaces: app shell, page header, section, surface, panel, toolbar, and
  inspector.
- States: status, alert, skeleton, and universal state.
- Data: data table, filter bar, saved-view control, and pagination.
- Evidence: proofline, evidence packet, decision gate, and audit timeline.
- Charts: chart frame, legend, bar visualization, and required table
  alternative.
- Overlays: dialog, drawer, popover, and tooltip.

Components use native semantics and controlled state. Icon-only buttons require
a `label`, overlays dismiss with Escape and restore focus, tabs support
arrow-key navigation, and every chart frame requires a data-table alternative.

## Runtime, Data, And Network Boundary

- Proofline requires React and React DOM `18.3.1` or newer.
- It contains components, tokens, CSS, and local interaction state. It does not
  persist user data, send telemetry, load a backend, or initiate application
  network requests.
- File selection, exports, persistence, provider calls, updater checks, and
  telemetry transports remain the responsibility of the host application.
- Lucide is the interface icon dependency; approved product marks remain
  repository-owned assets.

## Font And Public-Asset Boundary

- Aeonik, Whitney, GT Sectra, and every other private licensed font binary stay
  outside OSS source, `dist/`, npm tarballs, and release archives.
- The public CSS contains no remote font import and defaults to system sans,
  monospace, display, and numeric stacks.
- An authorized branded host may set the `--pl-official-font-*` variables from
  a host-owned stylesheet served from an approved same-origin path under the
  production CSP. If that stylesheet is absent or blocked, the system fallback
  remains the supported rendering.
- Isolated visual-capture tooling may use a temporary loopback font server, but
  that boundary is test-only and does not permit copying font binaries into a
  public package.

## Proof

```bash
pnpm --dir packages/proofline-oss typecheck
pnpm --dir packages/proofline-oss test
pnpm --dir packages/proofline-oss build
pnpm --dir packages/proofline-oss verify:public-assets
```

The tests cover native semantics, keyboard behavior, Escape/focus handling,
status labeling, and chart alternatives. `verify:public-assets` rejects private
font names and binaries, remote font imports, and other disallowed public
assets.

## Release Truth

The public `0.1.1` package passes typecheck, component tests, asset-boundary
verification, packed-file inspection, registry readback, and a clean external
install.
