from __future__ import annotations

from .replay import ReplayCase


def tool_outputs(case: ReplayCase) -> dict[str, list[object]]:
    outputs: dict[str, list[object]] = {}
    last_tool: str | None = None
    for event in case.events:
        if event.event_type == "tool_call":
            last_tool = event.tool_name
        elif event.event_type == "tool_result" and last_tool:
            outputs.setdefault(last_tool, []).append(event.output if event.error is None else {"error": event.error})
    return outputs
