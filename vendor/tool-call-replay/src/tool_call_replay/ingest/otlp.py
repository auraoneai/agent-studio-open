from __future__ import annotations

import json
from pathlib import Path

from tool_call_replay.redact import redact
from tool_call_replay.replay import ReplayCase, ReplayEvent


def ingest_otlp(path: str | Path) -> ReplayCase:
    payload = redact(json.loads(Path(path).read_text(encoding="utf8")))
    spans = payload.get("spans", payload.get("resourceSpans", []))
    events: list[ReplayEvent] = []
    for span in spans:
        attrs = span.get("attributes", span if isinstance(span, dict) else {})
        name = attrs.get("gen_ai.tool.name") or attrs.get("tool_name")
        if name:
            events.append(ReplayEvent("tool_call", tool_name=name, arguments=attrs.get("gen_ai.tool.arguments") or {}))
            if "gen_ai.tool.output" in attrs:
                events.append(ReplayEvent("tool_result", tool_name=name, output=attrs["gen_ai.tool.output"]))
    return ReplayCase("tool-call-replay/v1", payload.get("trace_id", "otlp-trace"), payload.get("goal", ""), events, payload.get("final_answer"))
