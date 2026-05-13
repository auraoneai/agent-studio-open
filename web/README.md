# Agent Studio Open Browser Edition

The browser edition uses the same React surface as the desktop app with a reduced capability set:

- MCP remote transports only: SSE, HTTP JSON-RPC, and WebSocket.
- No stdio transport because browsers cannot spawn local processes.
- No local OTLP receiver because browsers cannot bind a localhost listener.
- Secrets are passphrase-protected in browser storage rather than stored in the OS keychain.
- Trace sessions are stored in IndexedDB/local browser storage for the current browser profile.

The Vite app is designed to be deployable at `agentstudio.auraone.ai/web` and keeps the browser constraints visible in the UI settings and status panels.
