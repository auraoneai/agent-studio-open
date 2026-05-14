from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ReplayEvent:
    event_type: str
    tool_name: str | None = None
    arguments: dict[str, Any] | None = None
    output: Any | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.event_type,
            "tool_name": self.tool_name,
            "arguments": self.arguments or {},
            "output": self.output,
            "error": self.error,
        }


@dataclass(frozen=True)
class ReplayCase:
    schema_version: str
    trace_id: str
    goal: str
    events: list[ReplayEvent]
    final_answer: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "trace_id": self.trace_id,
            "goal": self.goal,
            "events": [event.to_dict() for event in self.events],
            "final_answer": self.final_answer,
        }


@dataclass(frozen=True)
class ReplayAssertion:
    name: str
    ok: bool
    detail: str


def load_replay(path: str | Path) -> ReplayCase:
    payload = json.loads(Path(path).read_text(encoding="utf8"))
    return ReplayCase(
        schema_version=payload.get("schema_version", "tool-call-replay/v1"),
        trace_id=payload.get("trace_id", "unknown"),
        goal=payload.get("goal", ""),
        events=[ReplayEvent(event_type=item.get("type", ""), tool_name=item.get("tool_name"), arguments=item.get("arguments") or {}, output=item.get("output"), error=item.get("error")) for item in payload.get("events", [])],
        final_answer=payload.get("final_answer"),
    )


def save_replay(case: ReplayCase, path: str | Path) -> None:
    Path(path).write_text(json.dumps(case.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf8")


def run_assertions(case: ReplayCase, assertions: dict[str, Any]) -> list[ReplayAssertion]:
    results: list[ReplayAssertion] = []
    tool_calls = [event for event in case.events if event.event_type == "tool_call"]
    expected_order = assertions.get("tool_order")
    if expected_order is not None:
        observed = [event.tool_name for event in tool_calls]
        results.append(ReplayAssertion("tool_order", observed == expected_order, f"observed={observed} expected={expected_order}"))
    expected_final = assertions.get("final_answer_contains")
    if expected_final is not None:
        answer = case.final_answer or ""
        results.append(ReplayAssertion("final_answer_contains", expected_final in answer, f"expected substring `{expected_final}` in `{answer}`"))
    max_retries = assertions.get("max_retries")
    if max_retries is not None:
        counts: dict[str, int] = {}
        for event in tool_calls:
            counts[event.tool_name or "unknown"] = counts.get(event.tool_name or "unknown", 0) + 1
        too_many = {name: count for name, count in counts.items() if count - 1 > int(max_retries)}
        results.append(ReplayAssertion("max_retries", not too_many, f"retry counts={counts} max_retries={max_retries}"))
    forbidden = set(assertions.get("forbidden_tools", []))
    if forbidden:
        used = {event.tool_name for event in tool_calls}
        blocked = sorted(item for item in used if item in forbidden)
        results.append(ReplayAssertion("forbidden_tools", not blocked, f"forbidden used={blocked}"))
    required_args = assertions.get("required_arguments", {})
    for tool_name, keys in required_args.items():
        matching = [event for event in tool_calls if event.tool_name == tool_name]
        missing = [key for event in matching for key in keys if key not in (event.arguments or {})]
        results.append(ReplayAssertion(f"required_arguments:{tool_name}", not missing and bool(matching), f"missing={missing}"))
    return results
