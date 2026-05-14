from __future__ import annotations

import json
from pathlib import Path


def load_spans(path: str | Path) -> list[dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    if "spans" in data:
        return data["spans"]
    resource_spans = data.get("resourceSpans", [])
    spans = []
    for resource in resource_spans:
        for scope in resource.get("scopeSpans", []):
            spans.extend(scope.get("spans", []))
    return spans


def attributes(span: dict) -> dict:
    raw = span.get("attributes", {})
    if isinstance(raw, dict):
        return raw
    parsed = {}
    for item in raw:
        key = item.get("key")
        value = item.get("value", {})
        parsed[key] = value.get("stringValue", value.get("intValue", value.get("doubleValue", value)))
    return parsed

