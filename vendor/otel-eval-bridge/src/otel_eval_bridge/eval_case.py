from __future__ import annotations

import re
from .otlp_reader import attributes
from .phoenix import normalize_phoenix_span

SECRET_RE = re.compile(r"(sk-[A-Za-z0-9_-]+|pypi-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


def redact(value):
    if isinstance(value, dict):
        return {key: ("[REDACTED]" if sensitive_key(key) else redact(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return EMAIL_RE.sub("[EMAIL]", SECRET_RE.sub("[SECRET]", value))
    return value


def sensitive_key(key: str) -> bool:
    lowered = key.lower()
    return any(part in lowered for part in ("authorization", "api_key", "token", "secret", "password"))


def span_to_eval_case(span: dict, redaction: bool = True) -> dict | None:
    span = normalize_phoenix_span(span)
    attrs = attributes(span)
    prompt = attrs.get("gen_ai.prompt") or attrs.get("llm.input_messages") or attrs.get("input.value")
    completion = attrs.get("gen_ai.completion") or attrs.get("llm.output_messages") or attrs.get("output.value")
    if prompt is None and completion is None:
        return None
    case = {
        "trace_id": span.get("trace_id") or span.get("traceId"),
        "span_id": span.get("span_id") or span.get("spanId") or span.get("id"),
        "name": span.get("name", "genai.span"),
        "input": prompt,
        "expected": attrs.get("eval.expected"),
        "observed": completion,
        "metadata": {
            "provider": attrs.get("gen_ai.system") or attrs.get("llm.provider"),
            "model": attrs.get("gen_ai.request.model") or attrs.get("llm.model_name"),
        },
    }
    return redact(case) if redaction else case

