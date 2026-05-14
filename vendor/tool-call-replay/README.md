# tool-call-replay

`tool-call-replay` turns agent tool-call traces into deterministic local replay artifacts and pytest regression tests. It helps agent teams convert production failures into reviewable test cases without live model calls or live tool execution.

## Quickstart

```bash
python -m venv .venv
. .venv/bin/activate
pip install tool-call-replay
tool-call-replay ingest examples/failed_refund_agent_trace.jsonl --out replay.json
tool-call-replay run replay.json --assert examples/refund_assertions.yaml
tool-call-replay pytest replay.json --assert examples/refund_assertions.yaml --out test_refund_agent_replay.py
```

## Supported Inputs

- simple JSONL traces;
- OpenAI-style event traces;
- OTLP/GenAI span exports;
- Phoenix-like JSON exports.

The v1 importers normalize all inputs into a canonical `ToolCallReplay` JSON object.

## What This Is Not

This is not an agent framework and does not call models, tools, or provider APIs. It replays recorded tool-call structure and mocked outputs so failures can become deterministic tests.
