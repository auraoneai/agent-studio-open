# Changelog

All notable changes to Agent Studio Open are documented in this file.

## Unreleased

No changes yet.

## 0.2.1 - 2026-07-13

### Changed

- Load licensed AuraOne typography in the hosted browser through a same-origin
  Vercel proxy without adding font binaries to the public repository or
  desktop bundle.
- Use the focused replay capture and point desktop/npm guidance at the
  dedicated public repository.
- Correct the PyPI long description and release guidance so the package page
  identifies `0.2.1` as published rather than describing `0.2.0` as an
  unreleased candidate.

## 0.2.0 - 2026-07-12

### Changed

- Replaced the cream, serif, remote-font, noise, gradient, and glass presentation
  with the light-first Proofline visual system.
- Aligned Connect, Compose, Traces, Replay, A2A, Data network, Compare, Ship,
  Settings, first-run, error, loading, empty, and evidence states.
- Added compact responsive navigation, 44px mobile controls, stronger focus
  indicators, reduced-motion support, and clearer semantic state colors.
- Replaced the pinned macOS artifact URL with a configurable stable release URL.
- Added an explicit signed-update state in Settings.
- Aligned the VS Code Compose webview with the same Proofline tokens.

### Release

- Synchronized the desktop, CLI, and VS Code release version at `0.2.0`.
- Desktop release links can be overridden with
  `VITE_AGENT_STUDIO_DESKTOP_RELEASE_URL`; the default points to the latest
  GitHub release rather than a versioned artifact.
