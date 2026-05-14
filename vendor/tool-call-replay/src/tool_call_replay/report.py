from __future__ import annotations

from .replay import ReplayAssertion, ReplayCase


def markdown_report(case: ReplayCase, results: list[ReplayAssertion]) -> str:
    lines = [
        "# Tool Call Replay Report",
        "",
        f"- Trace: `{case.trace_id}`",
        f"- Goal: {case.goal or 'unknown'}",
        f"- Events: `{len(case.events)}`",
        f"- Assertions: `{len(results)}`",
        "",
        "## Assertions",
        "",
    ]
    if not results:
        lines.append("No assertions configured.")
    else:
        lines.extend(["| Result | Assertion | Detail |", "| --- | --- | --- |"])
        for result in results:
            status = "pass" if result.ok else "fail"
            lines.append(f"| {status} | `{result.name}` | {result.detail.replace('|', '/')} |")
    lines.extend(["", "## Sequence", "", "```mermaid", "sequenceDiagram", "participant Agent"])
    for event in case.events:
        if event.event_type == "tool_call":
            lines.append(f"Agent->>Tool: {event.tool_name}")
        elif event.event_type == "tool_result":
            lines.append(f"Tool-->>Agent: {event.tool_name or 'result'}")
        elif event.event_type == "final_answer":
            lines.append("Agent-->>User: final answer")
    lines.extend(["```", ""])
    return "\n".join(lines)
