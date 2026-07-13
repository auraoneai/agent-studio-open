# agentstudio CLI

`agentstudio` is the headless Agent Studio Open runtime for protocol smoke
tests, local trace storage, deterministic replay exports, and Python sidecar
integration. It is intentionally local-first: traces are written to SQLite
`.ast` files and no network call is made unless a command explicitly targets a
server URL or export destination.

It is built for agent engineers and CI owners who need the same trace, replay,
comparison, and export contracts as the visual Agent Studio workbench without
running the desktop application. Its differentiator is one inspectable CLI
surface for MCP and A2A connectivity, OpenTelemetry trace intake, deterministic
regression evidence, and machine-readable automation output.

## Quick start

```bash
python -m pip install auraone-agent-studio-open
agentstudio --json self-test
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

For local development, run `python -m pip install -e .` from this directory.

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

## Inspectable Proof

The package ships synthetic MCP, A2A, trace, replay, and regression fixtures
under `tests/fixtures/`. Focused tests cover CLI exit behavior, JSON output,
trace import and search, deterministic replay, comparison, GitHub and JUnit
exports, provider dry runs, and sidecar integration.

Run the local proof suite before adopting a candidate build:

```bash
python -m pytest -p no:cacheprovider -q
rm -rf build dist src/*.egg-info
python -m build
python scripts/release_preflight.py --expected-version 0.2.0 --dist dist
```

## Runtime, Data, And Network Boundary

- Imported traces and `.ast` stores remain on the local filesystem unless an
  operator explicitly uploads or exports them.
- `connect http`, `connect sse`, `connect ws`, remote A2A cards, and non-dry-run
  provider commands contact only the endpoint supplied by the operator.
- OAuth tokens, bearer tokens, mTLS keys, and provider credentials come from
  explicit flags or environment configuration; the CLI does not provision or
  retain hosted credentials.
- Synthetic fixtures are examples and release evidence, not customer traces,
  production benchmarks, or adoption evidence.

## Release Status

The current public PyPI package is `auraone-agent-studio-open` `0.2.0`.
The wheel and source distribution were published from the coordinated AuraOne
Open release and independently verified against the registry hashes.

Install the current public package with:

```bash
python -m pip install "auraone-agent-studio-open==0.2.0"
```

Use the editable source command above when evaluating changes newer than the
published `0.2.0` package.

## Limitations

This package is not the hosted Agent Studio Cloud product and does not include
multi-user state, hosted trace storage, or AuraOne account requirements.
Provider behavior still depends on the explicitly configured remote endpoint,
and deterministic replay can assert recorded tool behavior but cannot prove a
live provider will return the same model output.

## Next Action

Start with `agentstudio --json self-test`, import the bundled synthetic trace,
and inspect one JSON or JUnit export. Before promoting `0.2.0`, repeat the clean
wheel install and release preflight from the exact tagged source and attach the
result to the coordinated AuraOne Open release record.
