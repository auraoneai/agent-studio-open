from __future__ import annotations

import html
import json


def render_card(card: dict, fmt: str = "markdown") -> str:
    if fmt == "json":
        return json.dumps(card, indent=2, sort_keys=True) + "\n"
    if fmt == "html":
        return _html(card)
    if fmt == "markdown":
        return _markdown(card)
    raise ValueError(f"unsupported format: {fmt}")


def _markdown(card: dict) -> str:
    lines = [
        "# Agent Trace Card",
        "",
        f"- Trace: `{card['trace_id']}`",
        f"- Outcome: `{card['outcome']}`",
        f"- Goal: {card.get('goal', '')}",
        f"- Regression status: `{card.get('regression_status', 'unknown')}`",
        f"- Retry count: `{card.get('retry_count', 0)}`",
        "",
        "## Tools",
        "",
    ]
    lines.extend([f"- `{tool}`" for tool in card.get("tools", [])] or ["- none"])
    lines.extend(["", "## Data Touched", ""])
    lines.extend([f"- `{item}`" for item in card.get("data_touched", [])] or ["- none recorded"])
    lines.extend(["", "## Failure Modes", ""])
    lines.extend([f"- `{item}`" for item in card.get("failure_modes", [])] or ["- none"])
    lines.extend(["", "## Human Intervention", "", card.get("human_intervention", "none recorded"), ""])
    return "\n".join(lines)


def _html(card: dict) -> str:
    body = _markdown(card)
    return f"<article><pre>{html.escape(body)}</pre></article>\n"
