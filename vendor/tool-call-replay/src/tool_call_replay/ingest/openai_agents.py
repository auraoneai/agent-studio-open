from __future__ import annotations

from pathlib import Path

from .jsonl import ingest_jsonl
from tool_call_replay.replay import ReplayCase


def ingest_openai_agents(path: str | Path) -> ReplayCase:
    """Ingest OpenAI Agents SDK-style JSONL events.

    The v1 importer accepts the same normalized field names as the simple JSONL importer
    plus common aliases handled there.
    """

    return ingest_jsonl(path)
