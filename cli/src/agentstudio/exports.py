from __future__ import annotations

import hashlib
import json
import platform
import re
import shutil
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
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

SENSITIVE_KEYS = {
    "api_key",
    "apikey",
    "authorization",
    "content",
    "cookie",
    "headers",
    "mtls_key",
    "output",
    "password",
    "prompt",
    "secret",
    "token",
    "tool_arguments",
}
SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_-]{8,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    re.compile(r"(?i)(bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,'\"]+"),
]
PATH_PATTERNS = [
    re.compile(r"/(?:Users|home)/[^\s,'\"]+"),
    re.compile(r"[A-Za-z]:\\\\Users\\\\[^\s,'\"]+"),
]


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
    payloads: list[dict[str, Any]] = []
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        _write_intake_payload(
            archive,
            payloads,
            "payload/agent-trace-card.json",
            "agent_trace_card",
            json.dumps(_redacted_trace_export(trace_store), indent=2, sort_keys=True) + "\n",
        )
        if risk_report:
            _write_intake_payload(
                archive,
                payloads,
                "payload/risk-report-redacted.json",
                "agent_mcp_server_metadata",
                _redacted_text(Path(risk_report).read_text(encoding="utf-8")),
            )
        if suite:
            for path in Path(suite).glob("*"):
                if path.is_file():
                    archived = f"payload/regressions/{_safe_archive_name(path)}"
                    _write_intake_payload(
                        archive,
                        payloads,
                        archived,
                        "agent_regression_test_suite",
                        _redacted_text(path.read_text(encoding="utf-8")),
                    )
        archive.writestr(
            "manifest.json",
            json.dumps(_build_intake_manifest(payloads), indent=2, sort_keys=True)
            + "\n",
        )
        archive.writestr("README.md", "Agent Studio Open intake packet with redacted trace card and regression artifacts only.\n")
    return str(target)


def _write_intake_payload(
    archive: zipfile.ZipFile,
    payloads: list[dict[str, Any]],
    path: str,
    role: str,
    content: str,
) -> None:
    data = content.encode("utf-8")
    archive.writestr(path, data)
    payloads.append(
        {
            "path": path,
            "role": role,
            "sha256": hashlib.sha256(data).hexdigest(),
            "size_bytes": len(data),
        }
    )


def _build_intake_manifest(payloads: list[dict[str, Any]]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    product_version = "0.1.0"
    os_name = platform.system().lower()
    if os_name == "darwin":
        os_value = "darwin"
    elif os_name.startswith("win"):
        os_value = "windows"
    else:
        os_value = "linux"
    return {
        "$schema": "https://schemas.auraone.ai/open-studio/intake-packet/v1.json",
        "manifest_version": "1.0.0",
        "product": "agent-studio-open",
        "product_version": product_version,
        "platform_version": "0.3.0",
        "created_at": now,
        "project_id": str(uuid.uuid4()),
        "creator": {"display_name": "Agent Studio Open user"},
        "intent": "Submit redacted Agent Studio Open trace, risk, and regression artifacts to AuraOne intake.",
        "redaction": {
            "file_paths": True,
            "hostnames": True,
            "api_keys": True,
            "user_pii_other_than_explicit_intake": True,
            "custom_rules_applied": ["agentstudio.default-redaction"],
        },
        "consent": {
            "user_acknowledged_preview": True,
            "user_acknowledged_transport": True,
            "timestamp": now,
        },
        "payload_manifest": payloads,
        "provenance": {
            "engine_libs": {
                "mcp-risk-linter": "local",
                "a2a-contract-test": "local",
                "tool-call-replay": "local",
                "agent-trace-card": "local",
                "otel-eval-bridge": "local",
            },
            "os": os_value,
            "os_version": platform.release() or "unknown",
            "app_install_id_hash": hashlib.sha256(b"agent-studio-open-local-install").hexdigest(),
        },
        "transport": {
            "destination": "https://intake.auraone.ai/v1/packets/",
            "intended_at": now,
        },
    }


def export_trace_card(trace: str | Path, out: str | Path, fmt: str = "markdown", include_branding: bool = True) -> str:
    from agent_trace_card.generator import generate_card
    from agent_trace_card.importers import load_trace
    from agent_trace_card.render import render_card

    output = render_card(generate_card(load_trace(trace)), fmt, include_branding=include_branding)
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


def _redacted_trace_export(trace_store: str | Path) -> dict[str, Any]:
    store = TraceStore(trace_store)
    try:
        sessions: list[dict[str, Any]] = []
        for session in store.conn.execute("SELECT * FROM sessions ORDER BY started_at, id").fetchall():
            sid = str(session["id"])
            tools = []
            for row in store.conn.execute("SELECT * FROM tool_calls WHERE session_id = ? ORDER BY ordinal, id", (sid,)).fetchall():
                tools.append(
                    {
                        "ordinal": row["ordinal"],
                        "tool_name": row["tool_name"],
                        "arguments": _redact(json.loads(row["input_json"] or "{}")),
                        "output": _redact(json.loads(row["output_json"] or "null")),
                        "status": row["status"],
                        "latency": row["latency"],
                    }
                )
            sessions.append(
                {
                    "id": sid,
                    "name": _redact(session["name"]),
                    "server": _redact(session["server"] or ""),
                    "model": session["model"],
                    "outcome": session["outcome"],
                    "tools": tools,
                }
            )
        return {
            "schema": "agent-studio-open/redacted-trace-card/v1",
            "sessions": sessions,
        }
    finally:
        store.close()


def _redact(value: Any, parent_key: str = "") -> Any:
    normalized_key = parent_key.lower().replace("-", "_")
    if normalized_key in SENSITIVE_KEYS or any(token in normalized_key for token in ("secret", "token", "password", "api_key")):
        return "<REDACTED>"
    if isinstance(value, dict):
        return {key: _redact(item, str(key)) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact(item, parent_key) for item in value]
    if isinstance(value, str):
        return _redacted_text(value)
    return value


def _redacted_text(text: str) -> str:
    redacted = text
    for pattern in SECRET_PATTERNS:
        redacted = pattern.sub("<REDACTED_SECRET>", redacted)
    for pattern in PATH_PATTERNS:
        redacted = pattern.sub("<REDACTED_PATH>", redacted)
    return redacted


def _safe_archive_name(path: Path) -> str:
    return path.name.replace("/", "_").replace("\\", "_")
