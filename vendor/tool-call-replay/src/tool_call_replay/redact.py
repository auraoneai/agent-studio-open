from __future__ import annotations

import re
from typing import Any


SECRET_KEYS = re.compile(r"(api[_-]?key|token|secret|password|authorization|credential)", re.I)


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: "[REDACTED]" if SECRET_KEYS.search(str(key)) else redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str) and re.search(r"(sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)", value):
        return "[REDACTED]"
    return value
