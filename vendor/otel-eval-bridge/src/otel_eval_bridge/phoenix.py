from __future__ import annotations


def normalize_phoenix_span(span: dict) -> dict:
    attrs = span.get("attributes", {})
    if "input.value" in attrs or "output.value" in attrs:
        attrs = {
            "gen_ai.prompt": attrs.get("input.value"),
            "gen_ai.completion": attrs.get("output.value"),
            "gen_ai.system": attrs.get("llm.provider", attrs.get("gen_ai.system")),
            **attrs,
        }
    return {**span, "attributes": attrs}

