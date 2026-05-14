# agentstudio CLI

`agentstudio` is the headless Agent Studio Open runtime for protocol smoke
tests, local trace storage, deterministic replay exports, and Python sidecar
integration. It is intentionally local-first: traces are written to SQLite
`.ast` files and no network call is made unless a command explicitly targets a
server URL or export destination.

## Quick start

```bash
python -m pip install -e .
agentstudio self-test --json
agentstudio connect stdio --command python --arg tests/fixtures/mcp_stdio_server.py --json
agentstudio connect http https://mcp.example.com/mcp \
  --oauth-resource-metadata-url https://mcp.example.com/.well-known/oauth-protected-resource \
  --oauth-access-token "$MCP_ACCESS_TOKEN" \
  --mtls-cert ~/.agentstudio/client.pem \
  --mtls-key ~/.agentstudio/client-key.pem \
  --json
agentstudio import-trace tests/fixtures/openai_events.jsonl --format openai --store /tmp/refund.ast
agentstudio store search /tmp/refund.ast refund --json
agentstudio export gh-action tests/fixtures/regressions --out /tmp/agent-regression
agentstudio export phoenix-json /tmp/refund.ast --out /tmp/refund.phoenix.json
agentstudio model --provider openai --model gpt-5.1 --prompt "Summarize the trace" --dry-run --stream --json
```

## Commands

- `connect stdio|http|sse|ws`: run MCP initialize and manifest discovery across
  stdio, JSON-RPC-over-HTTP, SSE, and WebSocket transports. HTTP/SSE support
  custom `--header name=value`, `--bearer-token`, `--oauth-access-token`,
  `--oauth-resource-metadata-url`, `--mtls-cert`, and `--mtls-key` options for
  protected remote MCP servers.
- `a2a`: load an A2A agent card from a file or URL and run the local contract
  suite.
- `import-trace`: normalize OpenAI-style events, OTLP JSON/proto, Phoenix JSON,
  and replay JSON into a portable `.ast` SQLite trace store.
- `otlp receive`: run a localhost OTLP HTTP JSON/proto receiver, or pass
  `--grpc --port 4317` for the OTLP gRPC TraceService.
- `store search`: full-text search sessions, turns, and tool calls in an `.ast`
  file.
- `replay`, `compare`, `export`: run deterministic assertions, diff trace
  stores, and emit GitHub Action, JUnit, PR-comment, Phoenix JSON, or AuraOne
  intake exports.
- `export trace-card`: render `agent-trace-card` Markdown, JSON, or HTML from a
  recorded trace.
- `model --stream`: emit newline-delimited stream events for provider responses;
  dry-run mode exercises the stream contract without a network call.
- `otel-bridge extract`: invoke `otel-eval-bridge` extraction for local eval
  cases with default redaction.
- `sidecar`: bootstrap or serve the Python sidecar used by the desktop app.
- `self-test`: verify engine package imports and CLI wiring.

This package is not the hosted Agent Studio Cloud product and does not include
multi-user state, hosted trace storage, or AuraOne account requirements.
