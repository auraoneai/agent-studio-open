from __future__ import annotations

import json
import shutil
import zipfile
from dataclasses import dataclass
from html import escape
from pathlib import Path
from typing import Any

from .trace_store import TraceStore


WORKFLOW = """name: Agent regression
on: [pull_request]
jobs:
  agent-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install tool-call-replay
      - run: |
          for f in regressions/*.json; do
            tool-call-replay run "$f" --assert "${f%.json}.assertions.yaml" || exit 1
          done
"""


@dataclass(frozen=True)
class DiffResult:
    baseline: list[dict[str, Any]]
    candidate: list[dict[str, Any]]
    differences: list[str]

    @property
    def passed(self) -> bool:
        return not self.differences

    def to_dict(self) -> dict[str, Any]:
        return {"passed": self.passed, "differences": self.differences, "baseline": self.baseline, "candidate": self.candidate}


def export_github_action(regressions: str | Path, out: str | Path) -> list[str]:
    source = Path(regressions)
    target = Path(out)
    workflow_path = target / ".github" / "workflows" / "agent-regression.yml"
    regression_path = target / "regressions"
    workflow_path.parent.mkdir(parents=True, exist_ok=True)
    regression_path.mkdir(parents=True, exist_ok=True)
    workflow_path.write_text(WORKFLOW, encoding="utf-8")
    copied: list[str] = [str(workflow_path)]
    for replay in sorted(source.glob("*.json")):
        dest = regression_path / replay.name
        shutil.copyfile(replay, dest)
        copied.append(str(dest))
        assertions = replay.with_suffix(".assertions.yaml")
        if assertions.exists():
            assertion_dest = regression_path / assertions.name
            shutil.copyfile(assertions, assertion_dest)
            copied.append(str(assertion_dest))
    readme = target / "README.md"
    readme.write_text("# Agent Studio regression export\n\nRun by GitHub Actions with `tool-call-replay`.\n", encoding="utf-8")
    copied.append(str(readme))
    return copied


def export_junit(results: list[dict[str, Any]], out: str | Path) -> str:
    failures = [item for item in results if not item.get("ok", item.get("passed", False))]
    cases = []
    for item in results:
        name = escape(str(item.get("name", "regression")))
        detail = escape(str(item.get("detail", "")))
        if item in failures:
            cases.append(f'<testcase name="{name}"><failure>{detail}</failure></testcase>')
        else:
            cases.append(f'<testcase name="{name}" />')
    xml = f'<testsuite name="agentstudio" tests="{len(results)}" failures="{len(failures)}">' + "".join(cases) + "</testsuite>\n"
    Path(out).write_text(xml, encoding="utf-8")
    return xml


def export_pr_comment(trace_store: str | Path, out: str | Path, session_id: str | None = None) -> str:
    store = TraceStore(trace_store)
    try:
        sid = session_id or store.first_session_id()
        tools = store.tool_sequence(sid)
    finally:
        store.close()
    lines = ["<!-- agentstudio-trace-card -->", "## Agent Studio Trace", "", f"- Session: `{sid}`", f"- Tool calls: {len(tools)}", ""]
    for index, tool in enumerate(tools, start=1):
        lines.append(f"{index}. `{tool['tool_name']}` status: `{tool['status']}`")
    markdown = "\n".join(lines) + "\n"
    Path(out).write_text(markdown, encoding="utf-8")
    return markdown


def export_intake(trace_store: str | Path, out: str | Path, risk_report: str | Path | None = None, suite: str | Path | None = None) -> str:
    target = Path(out)
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(trace_store, "trace.ast")
        if risk_report:
            archive.write(risk_report, "risk-report.json")
        if suite:
            for path in Path(suite).glob("*"):
                if path.is_file():
                    archive.write(path, f"regressions/{path.name}")
        archive.writestr("README.md", "Agent Studio Open intake packet. User-created local export.\n")
    return str(target)


def export_trace_card(trace: str | Path, out: str | Path, fmt: str = "markdown") -> str:
    from agent_trace_card.generator import generate_card
    from agent_trace_card.importers import load_trace
    from agent_trace_card.render import render_card

    output = render_card(generate_card(load_trace(trace)), fmt)
    Path(out).write_text(output, encoding="utf-8")
    return str(out)


def export_phoenix_json(trace_store: str | Path, out: str | Path, session_id: str | None = None) -> str:
    store = TraceStore(trace_store)
    try:
        sid = session_id or store.first_session_id()
        tools = store.tool_sequence(sid)
    finally:
        store.close()
    spans = []
    for index, tool in enumerate(tools):
        status = "ERROR" if tool["status"] == "error" else "OK"
        spans.append(
            {
                "name": tool["tool_name"],
                "context": {
                    "trace_id": sid,
                    "span_id": f"{index + 1:016x}",
                },
                "span_kind": "TOOL",
                "status_code": status,
                "attributes": {
                    "gen_ai.tool.name": tool["tool_name"],
                    "gen_ai.tool.arguments": tool["arguments"],
                    "agentstudio.status": tool["status"],
                    "agentstudio.turn_index": index,
                },
                "events": [
                    {
                        "name": "tool.result",
                        "attributes": {
                            "output": tool["output"],
                        },
                    }
                ],
            }
        )
    payload = {
        "schema": "phoenix.trace.v1",
        "source": "Agent Studio Open",
        "session_id": sid,
        "spans": spans,
    }
    Path(out).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return str(out)


def diff_trace_stores(baseline: str | Path, candidate: str | Path, baseline_session: str | None = None, candidate_session: str | None = None) -> DiffResult:
    left_store = TraceStore(baseline)
    right_store = TraceStore(candidate)
    try:
        left = left_store.tool_sequence(baseline_session)
        right = right_store.tool_sequence(candidate_session)
    finally:
        left_store.close()
        right_store.close()
    differences: list[str] = []
    if len(left) != len(right):
        differences.append(f"tool call count changed: {len(left)} -> {len(right)}")
    for index, (left_item, right_item) in enumerate(zip(left, right), start=1):
        if left_item["tool_name"] != right_item["tool_name"]:
            differences.append(f"turn {index} tool changed: {left_item['tool_name']} -> {right_item['tool_name']}")
        if left_item["arguments"] != right_item["arguments"]:
            differences.append(f"turn {index} arguments changed")
        if left_item["status"] != right_item["status"]:
            differences.append(f"turn {index} status changed: {left_item['status']} -> {right_item['status']}")
    return DiffResult(left, right, differences)


def write_diff_markdown(result: DiffResult, out: str | Path) -> str:
    status = "PASS" if result.passed else "FAIL"
    lines = [f"# Agent Studio Diff: {status}", ""]
    if result.differences:
        lines.extend(f"- {item}" for item in result.differences)
    else:
        lines.append("No behavioral differences detected.")
    text = "\n".join(lines) + "\n"
    Path(out).write_text(text, encoding="utf-8")
    return text
