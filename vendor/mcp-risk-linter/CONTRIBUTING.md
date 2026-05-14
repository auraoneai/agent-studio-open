# Contributing

Contributions should keep the linter deterministic, local-first, and conservative in its claims.

## Local Setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e .
python -m pytest -q
```

## Rule Changes

Every new rule needs:

- a stable rule id;
- severity;
- rationale;
- remediation text;
- at least one passing and one failing fixture.

Rules should not claim exploitability unless the scanner has concrete evidence.
