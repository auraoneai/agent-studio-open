from __future__ import annotations

import json

from .scanner import Finding, ScanReport


def render_report(report: ScanReport, fmt: str) -> str:
    if fmt == "json":
        return json.dumps(report.to_dict(), indent=2, sort_keys=True) + "\n"
    if fmt == "sarif":
        return json.dumps(_to_sarif(report), indent=2, sort_keys=True) + "\n"
    if fmt == "markdown":
        return _to_markdown(report)
    raise ValueError(f"unsupported report format: {fmt}")


def _to_markdown(report: ScanReport) -> str:
    lines = [
        "# MCP Risk Lint Report",
        "",
        f"- Root: `{report.root}`",
        f"- Findings: `{len(report.findings)}`",
        f"- Tools discovered: `{len(report.tools)}`",
        "",
    ]
    if report.tools:
        lines.extend(["## Tools", "", "| Name | Source | Description |", "| --- | --- | --- |"])
        for tool in report.tools:
            lines.append(f"| `{tool.name}` | `{tool.source}` | {tool.description.replace('|', '/')} |")
        lines.append("")
    if not report.findings:
        lines.extend(["## Findings", "", "No findings.", ""])
        return "\n".join(lines)
    lines.extend(["## Findings", "", "| Severity | Rule | Location | Finding | Remediation |", "| --- | --- | --- | --- | --- |"])
    for finding in report.findings:
        location = f"`{finding.path}:{finding.line}`"
        message = finding.message.replace("|", "/")
        remediation = finding.remediation.replace("|", "/")
        lines.append(f"| {finding.severity} | `{finding.rule_id}` | {location} | {message} | {remediation} |")
    lines.append("")
    lines.extend(
        [
            "## Scope",
            "",
            "This report is a readiness signal, not a vulnerability report, penetration test, or official MCP compliance claim.",
            "",
        ]
    )
    return "\n".join(lines)


def _to_sarif(report: ScanReport) -> dict[str, object]:
    rules = {}
    results = []
    for finding in report.findings:
        rules[finding.rule_id] = {
            "id": finding.rule_id,
            "name": finding.rule_id,
            "shortDescription": {"text": finding.message},
            "help": {"text": finding.remediation},
        }
        results.append(_finding_to_sarif(finding))
    return {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [
            {
                "tool": {"driver": {"name": "mcp-risk-linter", "rules": list(rules.values())}},
                "results": results,
            }
        ],
    }


def _finding_to_sarif(finding: Finding) -> dict[str, object]:
    level = "error" if finding.severity in {"critical", "high"} else "warning" if finding.severity == "medium" else "note"
    return {
        "ruleId": finding.rule_id,
        "level": level,
        "message": {"text": finding.message},
        "locations": [
            {
                "physicalLocation": {
                    "artifactLocation": {"uri": finding.path},
                    "region": {"startLine": finding.line},
                }
            }
        ],
    }
