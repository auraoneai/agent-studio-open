from __future__ import annotations

from pathlib import Path

from .otlp import ingest_otlp
from tool_call_replay.replay import ReplayCase


def ingest_phoenix(path: str | Path) -> ReplayCase:
    """Ingest Phoenix-like JSON exports using the OTLP attribute mapping."""

    return ingest_otlp(path)
