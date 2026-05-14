from __future__ import annotations

import json
from pathlib import Path

from tool_call_replay.redact import redact
from tool_call_replay.replay import ReplayCase, ReplayEvent


def ingest_jsonl(path: str | Path) -> ReplayCase:
    events: list[ReplayEvent] = []
    trace_id = "unknown"
    goal = ""
    final_answer = None
    for line in Path(path).read_text(encoding="utf8").splitlines():
        if not line.strip():
            continue
        item = redact(json.loads(line))
        event_type = item.get("type") or item.get("event")
        trace_id = item.get("trace_id", trace_id)
        if event_type == "goal":
            goal = item.get("content", goal)
        elif event_type in {"tool_call", "function_call"}:
            events.append(ReplayEvent("tool_call", tool_name=item.get("tool_name") or item.get("name"), arguments=item.get("arguments") or {}))
        elif event_type in {"tool_result", "function_result"}:
            events.append(ReplayEvent("tool_result", tool_name=item.get("tool_name") or item.get("name"), output=item.get("output"), error=item.get("error")))
        elif event_type in {"final", "final_answer"}:
            final_answer = item.get("content") or item.get("final_answer")
            events.append(ReplayEvent("final_answer", output=final_answer))
    return ReplayCase("tool-call-replay/v1", trace_id, goal, events, final_answer)
