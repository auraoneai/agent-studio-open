from __future__ import annotations

import json
from pathlib import Path

from .replay import ReplayCase


def generate_pytest(case: ReplayCase, assertions: dict[str, object]) -> str:
    replay_json = json.dumps(case.to_dict(), sort_keys=True)
    assertions_json = json.dumps(assertions, sort_keys=True)
    return f'''import json
from tool_call_replay.replay import ReplayCase, ReplayEvent, run_assertions


def test_tool_call_replay_regression():
    payload = json.loads({replay_json!r})
    case = ReplayCase(
        schema_version=payload["schema_version"],
        trace_id=payload["trace_id"],
        goal=payload["goal"],
        events=[ReplayEvent(event_type=item["type"], tool_name=item.get("tool_name"), arguments=item.get("arguments"), output=item.get("output"), error=item.get("error")) for item in payload["events"]],
        final_answer=payload.get("final_answer"),
    )
    results = run_assertions(case, json.loads({assertions_json!r}))
    assert all(result.ok for result in results), [result.detail for result in results if not result.ok]
'''


def write_pytest(case: ReplayCase, assertions: dict[str, object], path: str | Path) -> None:
    Path(path).write_text(generate_pytest(case, assertions), encoding="utf8")
