from __future__ import annotations

from typing import Any


MUTATING_TOOLS = {"issue_refund", "send_email", "delete_order", "write_file", "create_ticket", "update_ticket"}


def generate_card(trace: dict[str, Any]) -> dict[str, Any]:
    events = trace.get("events", [])
    tool_calls = [event for event in events if event.get("type") == "tool_call"]
    tools = [event.get("tool_name", "unknown") for event in tool_calls]
    retry_count = _retry_count(tools)
    final_answer = trace.get("final_answer") or _last_final(events)
    failure_modes = _failure_modes(tools, final_answer, events)
    return {
        "schema_version": "agent-trace-card/v1",
        "trace_id": trace.get("trace_id", "unknown"),
        "goal": trace.get("goal", ""),
        "outcome": "failed" if failure_modes else "passed",
        "tools": sorted(set(tools)),
        "retry_count": retry_count,
        "data_touched": _data_touched(tool_calls),
        "policy_checks": trace.get("policy_checks", []),
        "failure_modes": failure_modes,
        "human_intervention": trace.get("human_intervention", "none recorded"),
        "regression_status": trace.get("regression_status", "not covered"),
        "links": trace.get("links", {}),
    }


def _retry_count(tools: list[str]) -> int:
    counts: dict[str, int] = {}
    retries = 0
    for tool in tools:
        counts[tool] = counts.get(tool, 0) + 1
        if counts[tool] > 1:
            retries += 1
    return retries


def _last_final(events: list[dict[str, Any]]) -> str:
    for event in reversed(events):
        if event.get("type") == "final_answer":
            return str(event.get("output") or "")
    return ""


def _failure_modes(tools: list[str], final_answer: str, events: list[dict[str, Any]]) -> list[str]:
    modes: list[str] = []
    for tool in set(tools):
        if tools.count(tool) > 1 and tool in MUTATING_TOOLS:
            modes.append("duplicate_mutating_tool_call")
    if "twice" in (final_answer or "").lower():
        modes.append("incorrect_terminal_answer")
    if any(event.get("error") for event in events):
        modes.append("tool_error")
    return sorted(set(modes))


def _data_touched(tool_calls: list[dict[str, Any]]) -> list[str]:
    touched: set[str] = set()
    for event in tool_calls:
        args = event.get("arguments") or {}
        for key in ["order_id", "user_id", "account_id", "ticket_id", "file_path"]:
            if key in args:
                touched.add(f"{key}:{args[key]}")
    return sorted(touched)
