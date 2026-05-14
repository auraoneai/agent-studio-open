from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    source: str
    mutating_hint: bool = False


TOOL_NAME_KEYS = {"name", "tool_name", "id"}
DESCRIPTION_KEYS = {"description", "summary", "title"}
MUTATING_WORDS = re.compile(r"\b(write|create|update|delete|remove|send|modify|edit|commit|push|upload|purchase)\b", re.I)


def load_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def extract_tools_from_json(value: Any, source: str) -> list[ToolDefinition]:
    found: list[ToolDefinition] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            keys = set(node)
            if keys & TOOL_NAME_KEYS and keys & DESCRIPTION_KEYS:
                name = str(next((node[key] for key in TOOL_NAME_KEYS if key in node), "unknown"))
                desc = str(next((node[key] for key in DESCRIPTION_KEYS if key in node), ""))
                found.append(
                    ToolDefinition(
                        name=name,
                        description=desc,
                        source=source,
                        mutating_hint=bool(MUTATING_WORDS.search(name + " " + desc)),
                    )
                )
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(value)
    return found


def extract_tools_from_text(text: str, source: str) -> list[ToolDefinition]:
    tools: list[ToolDefinition] = []
    patterns = [
        re.compile(r"tool\s*\(\s*name\s*=\s*['\"](?P<name>[^'\"]+)['\"].{0,240}?description\s*=\s*['\"](?P<desc>[^'\"]+)['\"]", re.I | re.S),
        re.compile(r"registerTool\s*\(\s*['\"](?P<name>[^'\"]+)['\"].{0,240}?description\s*:\s*['\"](?P<desc>[^'\"]+)['\"]", re.I | re.S),
        re.compile(r"name\s*:\s*['\"](?P<name>[^'\"]+)['\"].{0,160}?description\s*:\s*['\"](?P<desc>[^'\"]+)['\"]", re.I | re.S),
    ]
    for pattern in patterns:
        for match in pattern.finditer(text):
            name = match.group("name")
            desc = match.group("desc")
            tools.append(
                ToolDefinition(
                    name=name,
                    description=desc,
                    source=source,
                    mutating_hint=bool(MUTATING_WORDS.search(name + " " + desc)),
                )
            )
    return tools
