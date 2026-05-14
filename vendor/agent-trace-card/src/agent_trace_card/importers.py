from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_trace(path: str | Path) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf8"))
    if "events" in payload:
        return payload
    if all(key in payload for key in ["trace_id", "goal", "tools"]):
        return payload
    raise ValueError("unsupported trace format")
