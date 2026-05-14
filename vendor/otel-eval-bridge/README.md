# otel-eval-bridge

`otel-eval-bridge` turns OpenTelemetry or Phoenix GenAI trace exports into local
eval regression cases. It can also emit simple `eval-run-manifest` references and
attach eval result summaries back to trace IDs.

Privacy redaction is enabled by default.

## Scope

This is not an observability backend, compliance claim, or OpenTelemetry
standardization proposal. It is a local bridge for turning trace exports into
reviewable eval artifacts while preserving trace references and applying
default redaction.

## Quick start

```bash
python -m pip install -e .
otel-eval-bridge extract examples/genai_trace.json --out eval_cases.jsonl
otel-eval-bridge manifest eval_cases.jsonl --out manifest.json
otel-eval-bridge attach eval_cases.jsonl examples/eval_results.json --out trace_results.json
```

The JSONL output is intentionally simple so it can be adapted by `eval-adapter`
or any in-house eval runner.
