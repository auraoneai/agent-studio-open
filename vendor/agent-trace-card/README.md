# agent-trace-card

`agent-trace-card` generates portable Markdown, HTML, and JSON cards for agent traces. A card summarizes one agent run or failure: goal, outcome, tools used, retries, data touched, policy/rubric checks, failure mode, human intervention, and regression status.

## Quickstart

```bash
python -m venv .venv
. .venv/bin/activate
pip install agent-trace-card
agent-trace-card generate --from examples/refund_trace.json --out card.md
agent-trace-card validate examples/refund_agent_card.json
```

Bundled examples include a failed duplicate-refund trace, a passing read-only trace, and a human-intervened support-review trace. They are synthetic tutorial data only.

## What This Is Not

This is not an observability backend, agent framework, safety certification, or benchmark. It is a shareable review artifact that makes agent traces easier to discuss and turn into regression work.
