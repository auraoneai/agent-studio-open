# Changelog

All notable changes to Agent Studio Open are documented in this file.

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
