# a2a-contract-test

`a2a-contract-test` is a small offline contract-test kit for A2A-style agent
cards and task lifecycle behavior. It validates agent cards, capabilities,
structured payloads, errors, cancellation behavior, and terminal task states
without making network calls.

This project is not an official A2A compliance suite and is not affiliated with
the Linux Foundation or any A2A standards body. It is a practical PR gate for
teams that want predictable agent-to-agent behavior.

## Quick start

```bash
python -m pip install -e .
a2a-contract-test run --agent-card examples/passing_agent/agent-card.json
a2a-contract-test run --agent-card examples/failing_agent/agent-card.json --out report.md
```

The runner looks for `contract-transcript.json` next to the agent card unless a
custom transcript is supplied with `--transcript`.

## What it checks

- Required agent-card fields and endpoint shape.
- Declared capabilities and JSON content parts.
- Task lifecycle transitions from submitted to terminal states.
- Cancellation support when declared.
- Error payload structure and unsupported capability negotiation.
- Redacted HTTP-style transcript snippets for reproducibility.

## Reports

Use `--format json` for machine-readable CI output or the default Markdown
format for PR comments and issue attachments.

