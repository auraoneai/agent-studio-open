from __future__ import annotations

from pathlib import Path
from typing import Any

from .agent_card import load_json


def load_transcript(agent_card_path: str | Path, transcript_path: str | Path | None = None) -> list[dict[str, Any]]:
    path = Path(transcript_path) if transcript_path else Path(agent_card_path).with_name("contract-transcript.json")
    data = load_json(path)
    if not isinstance(data, list):
        raise ValueError("contract transcript must be a JSON list")
    return data

