# Contributing

Keep replay deterministic. Importers should redact secrets and should never call external tools or models.

```bash
python -m pytest -q
python -m build
twine check dist/*
```
