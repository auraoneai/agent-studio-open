from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

URL_RE = re.compile(r"^https?://[^/]+")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+")


def load_json(path: str | Path) -> dict[str, Any] | list[Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def validate_agent_card(card: dict[str, Any]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    required = ["name", "version", "endpoint", "capabilities", "content_types"]
    for field in required:
        if field not in card:
            findings.append(finding("high", "agent-card", f"missing required field `{field}`"))

    if card.get("version") and not SEMVER_RE.match(str(card["version"])):
        findings.append(finding("medium", "agent-card", "`version` should be semantic version-like"))

    endpoint = card.get("endpoint")
    if endpoint and not URL_RE.match(str(endpoint)):
        findings.append(finding("high", "agent-card", "`endpoint` must be an HTTP(S) URL"))

    capabilities = card.get("capabilities")
    if not isinstance(capabilities, list) or not capabilities:
        findings.append(finding("high", "agent-card", "`capabilities` must be a non-empty list"))
        return findings

    names: set[str] = set()
    for index, capability in enumerate(capabilities):
        if not isinstance(capability, dict):
            findings.append(finding("high", "capability", f"capability {index} must be an object"))
            continue
        name = capability.get("name")
        if not name:
            findings.append(finding("high", "capability", f"capability {index} is missing `name`"))
        elif name in names:
            findings.append(finding("medium", "capability", f"duplicate capability `{name}`"))
        names.add(str(name))
        for mode_field in ("input_modes", "output_modes"):
            modes = capability.get(mode_field)
            if not isinstance(modes, list) or not modes:
                findings.append(finding("high", "capability", f"`{name or index}` missing `{mode_field}`"))
        if "streaming" not in capability:
            findings.append(finding("medium", "capability", f"`{name or index}` missing `streaming` flag"))

    content_types = card.get("content_types")
    if not isinstance(content_types, list) or "application/json" not in content_types:
        findings.append(finding("medium", "agent-card", "`content_types` should include `application/json`"))

    return findings


def finding(severity: str, category: str, message: str) -> dict[str, str]:
    return {"severity": severity, "category": category, "message": message}

