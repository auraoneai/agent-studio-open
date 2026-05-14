from __future__ import annotations

import json
from pathlib import Path


def load_cases(path: str | Path) -> list[dict]:
    cases = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                cases.append(json.loads(line))
    return cases


def build_manifest(cases: list[dict]) -> dict:
    return {
        "schema": "auraone.eval-run-manifest.v1",
        "case_count": len(cases),
        "trace_refs": [{"trace_id": case.get("trace_id"), "span_id": case.get("span_id")} for case in cases],
    }


def attach_results(cases: list[dict], results: dict) -> list[dict]:
    attached = []
    for case in cases:
        trace_id = case.get("trace_id")
        attached.append({**case, "eval_result": results.get(trace_id, results.get(case.get("span_id"), {}))})
    return attached

