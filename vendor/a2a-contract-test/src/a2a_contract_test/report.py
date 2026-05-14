from __future__ import annotations

import json
from typing import Any

from .assertions import redact


def build_result(card: dict[str, Any], transcript: list[dict[str, Any]], findings: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "tool": "a2a-contract-test",
        "agent": card.get("name", "unknown"),
        "passed": not any(item["severity"] in {"high", "critical"} for item in findings),
        "finding_count": len(findings),
        "findings": findings,
        "transcript": redact(transcript),
        "disclaimer": "Practical contract profile only; not an official A2A compliance claim.",
    }


def render_json(result: dict[str, Any]) -> str:
    return json.dumps(result, indent=2, sort_keys=True) + "\n"


def render_markdown(result: dict[str, Any]) -> str:
    lines = [
        "# A2A Contract Report",
        "",
        f"- Agent: `{result['agent']}`",
        f"- Passed: `{str(result['passed']).lower()}`",
        f"- Findings: `{result['finding_count']}`",
        "",
        "## Findings",
        "",
    ]
    if result["findings"]:
        for item in result["findings"]:
            lines.append(f"- `{item['severity']}` `{item['category']}`: {item['message']}")
    else:
        lines.append("- No findings.")
    lines.extend([
        "",
        "## Redacted Transcript",
        "",
        "```json",
        json.dumps(result["transcript"], indent=2, sort_keys=True),
        "```",
        "",
        "## Disclaimer",
        "",
        result["disclaimer"],
        "",
    ])
    return "\n".join(lines)

