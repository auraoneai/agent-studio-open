from __future__ import annotations

import json
import hashlib
import os
import shutil
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape
from pathlib import Path
from typing import Any

from . import __version__
from .trace_store import TraceStore


EVIDENCE_SCHEMA = "agentstudio.export-evidence.v1"
EVIDENCE_MANIFEST = "agentstudio-export-manifest.json"

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


def build_export_evidence(
    *,
    kind: str,
    source: str | Path,
    destination: str | Path,
    artifact_filename: str,
    artifact_format: str,
    media_type: str,
    files: list[tuple[str, bytes, str, str]],
    replay_result: Any = None,
    comparison_result: Any = None,
    generated_at: str | None = None,
) -> dict[str, Any]:
    source_path = Path(source)
    source_descriptor = _source_trace_descriptor(source_path)
    file_evidence = [
        {
            "path": path,
            "format": file_format,
            "mediaType": file_media_type,
            "bytes": len(content),
            "sha256": _sha256(content),
        }
        for path, content, file_media_type, file_format in files
    ]
    return {
        "schema": EVIDENCE_SCHEMA,
        "generatedAt": generated_at or _generated_at(),
        "sourceBuild": {
            "product": "Agent Studio Open",
            "version": __version__,
            "commit": os.environ.get("AGENT_STUDIO_SOURCE_COMMIT", f"package-{__version__}"),
            "state": os.environ.get("AGENT_STUDIO_SOURCE_STATE", "installed-runtime"),
            "sourceDigest": os.environ.get("AGENT_STUDIO_SOURCE_DIGEST")
            or _directory_digest(Path(__file__).resolve().parent),
        },
        "sourceTrace": source_descriptor,
        "replay": {
            "state": _replay_state(replay_result),
            "result": replay_result,
        },
        "comparison": {
            "state": _comparison_state(comparison_result),
            "result": comparison_result,
        },
        "destination": {
            "mode": "filesystem",
            "path": str(destination),
        },
        "artifact": {
            "kind": kind,
            "filename": artifact_filename,
            "format": artifact_format,
            "mediaType": media_type,
            "sha256": _artifact_digest(files),
            "files": file_evidence,
        },
    }


def write_export_manifest(directory: str | Path, evidence: dict[str, Any]) -> Path:
    path = Path(directory) / EVIDENCE_MANIFEST
    path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def append_export_manifest(archive_path: str | Path, evidence: dict[str, Any]) -> None:
    with zipfile.ZipFile(archive_path, "a", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(EVIDENCE_MANIFEST, json.dumps(evidence, indent=2, sort_keys=True) + "\n")


def evidence_files_from_paths(
    paths: list[str | Path],
    root: str | Path,
) -> list[tuple[str, bytes, str, str]]:
    root_path = Path(root)
    files: list[tuple[str, bytes, str, str]] = []
    for path_value in paths:
        path = Path(path_value)
        relative_path = path.relative_to(root_path).as_posix()
        media_type, file_format = _file_contract(relative_path)
        files.append((relative_path, path.read_bytes(), media_type, file_format))
    return files


def evidence_files_from_zip(
    archive_path: str | Path,
) -> list[tuple[str, bytes, str, str]]:
    files: list[tuple[str, bytes, str, str]] = []
    with zipfile.ZipFile(archive_path) as archive:
        for name in sorted(archive.namelist()):
            if name == EVIDENCE_MANIFEST or name.endswith("/"):
                continue
            media_type, file_format = _file_contract(name)
            files.append((name, archive.read(name), media_type, file_format))
    return files


def add_archive_checksum(
    evidence: dict[str, Any],
    archive_path: str | Path,
) -> dict[str, Any]:
    evidence["artifact"]["archiveSha256"] = _sha256(Path(archive_path).read_bytes())
    return evidence


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


def _source_trace_descriptor(source: Path) -> dict[str, str]:
    if not source.exists():
        raise FileNotFoundError(source)
    source_id = source.stem or source.name
    if source.is_dir():
        candidates = sorted(source.glob("*.json"))
        if candidates:
            source_id = _trace_id_from_json(candidates[0]) or source_id
        digest = _directory_digest(source)
    else:
        digest = _sha256(source.read_bytes())
        if source.suffix == ".ast":
            store = TraceStore(source)
            try:
                source_id = store.first_session_id()
            except KeyError:
                pass
            finally:
                store.close()
        elif source.suffix.lower() in {".json", ".jsonl"}:
            source_id = _trace_id_from_json(source) or source_id
    return {
        "id": source_id,
        "path": str(source),
        "sha256": digest,
    }


def _trace_id_from_json(path: Path) -> str | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if isinstance(payload, list):
        payload = payload[0] if payload else {}
    if not isinstance(payload, dict):
        return None
    trace = payload.get("trace")
    if isinstance(trace, dict):
        payload = trace
    for key in ("trace_id", "traceId", "session_id", "sessionId", "id", "name"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _directory_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative_path = path.relative_to(root)
        if _ignored_generated_path(relative_path):
            continue
        digest.update(relative_path.as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _artifact_digest(files: list[tuple[str, bytes, str, str]]) -> str:
    digest = hashlib.sha256()
    for path, content, _, _ in files:
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(content)
        digest.update(b"\0")
    return digest.hexdigest()


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _generated_at() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _replay_state(result: Any) -> str:
    if result is None:
        return "not-run"
    if isinstance(result, dict):
        state = result.get("status") or result.get("state")
        if state in {"passed", "review", "failed"}:
            return str(state)
    if isinstance(result, list):
        failed = any(not bool(item.get("ok", item.get("passed", False))) for item in result if isinstance(item, dict))
        return "failed" if failed else "passed"
    return "passed"


def _comparison_state(result: Any) -> str:
    if result is None:
        return "not-run"
    if isinstance(result, dict):
        if result.get("passed") is False:
            return "failed"
        if result.get("passed") is True:
            return "passed"
        state = result.get("status") or result.get("state")
        if state in {"passed", "review", "failed"}:
            return str(state)
    return "review"


def _file_contract(path: str) -> tuple[str, str]:
    normalized = path.replace("\\", "/")
    if normalized == ".github/workflows/agent-regression.yml":
        return "text/yaml", "github-actions-workflow"
    if normalized.endswith(".assertions.yaml"):
        return "text/yaml", "tool-call-replay-assertions"
    if normalized.startswith("regressions/") and normalized.endswith(".json"):
        return "application/json", "tool-call-replay"
    if normalized == "trace-card.json":
        return "application/json", "agent-trace-card-json"
    if normalized == "trace.ast":
        return "application/octet-stream", "agentstudio-trace-store"
    if normalized.endswith(".xml"):
        return "application/xml", "junit-xml"
    if normalized.endswith(".md"):
        return "text/markdown", "markdown"
    if normalized.endswith(".zip"):
        return "application/zip", "zip"
    if normalized.endswith((".yaml", ".yml")):
        return "text/yaml", "yaml"
    if normalized.endswith(".json"):
        return "application/json", "json"
    return "application/octet-stream", "binary"


def _ignored_generated_path(path: Path) -> bool:
    ignored_directories = {
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".cache",
        "coverage",
        "htmlcov",
        "dist",
        "build",
    }
    if any(part in ignored_directories or part.endswith(".egg-info") for part in path.parts[:-1]):
        return True
    return (
        path.name == ".DS_Store"
        or path.suffix in {".pyc", ".pyo"}
        or path.name == ".coverage"
    )
