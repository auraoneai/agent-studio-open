from __future__ import annotations

import json
import os
import subprocess  # nosec B404
import sys
import tempfile
import venv
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ENGINE_PACKAGES = [
    "mcp_risk_linter",
    "a2a_contract_test",
    "tool_call_replay",
    "agent_trace_card",
    "otel_eval_bridge",
]
ENGINE_COMMANDS = {"risk-scan", "a2a", "trace-card", "otel-extract"}
DEFAULT_MAX_SIDECAR_BODY_BYTES = 1024 * 1024
DEFAULT_SIDECAR_TIMEOUT_SECONDS = 30


class SidecarWorkerError(RuntimeError):
    pass


def bootstrap_venv(
    path: str | Path,
    requirements: str | Path | None = None,
    timeout: float = 120,
) -> dict[str, Any]:
    target = Path(path)
    builder = venv.EnvBuilder(with_pip=True, clear=False)
    builder.create(target)
    python = target / ("Scripts/python.exe" if sys.platform.startswith("win") else "bin/python")
    installed = False
    if requirements:
        with tempfile.TemporaryDirectory(prefix="agentstudio-sidecar-bootstrap-") as temp_dir:
            # sidecar bootstrap intentionally invokes local pip with shell=False.
            subprocess.run(  # nosec B603
                [str(python), "-m", "pip", "install", "-r", str(requirements)],
                check=True,
                env=_sanitized_env(temp_dir),
                timeout=timeout,
            )
            installed = True
    return {"venv": str(target), "python": str(python), "requirements_installed": installed}


def health() -> dict[str, Any]:
    imports: dict[str, bool] = {}
    for package in ENGINE_PACKAGES:
        try:
            __import__(package)
            imports[package] = True
        except Exception:
            imports[package] = False
    return {"ok": all(imports.values()), "imports": imports}


class SidecarHandler(BaseHTTPRequestHandler):
    server_version = "agentstudio-sidecar/0.1"
    max_body_bytes = DEFAULT_MAX_SIDECAR_BODY_BYTES
    command_timeout_seconds = DEFAULT_SIDECAR_TIMEOUT_SECONDS

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_error(404)
            return
        self._json(health())

    def do_POST(self) -> None:
        command = self.path.strip("/")
        if command not in ENGINE_COMMANDS:
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("content-length", ""))
        except ValueError:
            self.send_error(400, "invalid content-length")
            return
        if length <= 0:
            self.send_error(411, "content-length required")
            return
        if length > type(self).max_body_bytes:
            self.send_error(413, "sidecar request too large")
            return
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self.send_error(400, "invalid JSON request")
            return
        try:
            self._json(
                run_isolated_command(
                    command,
                    payload,
                    timeout=type(self).command_timeout_seconds,
                ),
            )
        except subprocess.TimeoutExpired:
            self.send_error(504, "sidecar command timed out")
        except SidecarWorkerError as error:
            self.send_error(500, str(error))

    def log_message(self, format: str, *args: Any) -> None:
        return None

    def _json(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_isolated_command(
    command: str,
    payload: dict[str, Any],
    timeout: float = DEFAULT_SIDECAR_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    if command not in ENGINE_COMMANDS:
        raise ValueError(f"unsupported sidecar command: {command}")
    with tempfile.TemporaryDirectory(prefix="agentstudio-sidecar-") as temp_dir:
        proc = subprocess.run(  # nosec B603
            [sys.executable, "-m", "agentstudio.sidecar_worker", command],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
            timeout=timeout,
            env=_sanitized_env(temp_dir),
        )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "worker exited without detail").strip()
        raise SidecarWorkerError(detail)
    try:
        result = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as error:
        raise SidecarWorkerError(f"worker returned invalid JSON: {error}") from error
    if not isinstance(result, dict):
        raise SidecarWorkerError("worker returned a non-object JSON payload")
    return result


def execute_engine_command(command: str, payload: dict[str, Any]) -> dict[str, Any]:
    if command == "risk-scan":
        from mcp_risk_linter.report import render_report
        from mcp_risk_linter.scanner import scan_path

        report = scan_path(payload["path"])
        return json.loads(render_report(report, "json"))
    if command == "a2a":
        from a2a_contract_test.agent_card import validate_agent_card
        from a2a_contract_test.assertions import validate_transcript
        from a2a_contract_test.report import build_result

        card = payload["card"]
        transcript = payload.get("transcript", [])
        return build_result(
            card,
            transcript,
            validate_agent_card(card) + validate_transcript(card, transcript),
        )
    if command == "trace-card":
        from agent_trace_card.generator import generate_card
        from agent_trace_card.importers import load_trace
        from agent_trace_card.render import render_card

        card = generate_card(load_trace(payload["trace"]))
        output = render_card(
            card,
            payload.get("format", "markdown"),
            include_branding=payload.get("include_branding", True),
        )
        if payload.get("out"):
            Path(payload["out"]).write_text(output, encoding="utf-8")
        return {
            "ok": True,
            "out": payload.get("out"),
            "format": payload.get("format", "markdown"),
        }
    if command == "otel-extract":
        from otel_eval_bridge.eval_case import span_to_eval_case
        from otel_eval_bridge.otlp_reader import load_spans

        cases = [
            case
            for span in load_spans(payload["trace"])
            if (
                case := span_to_eval_case(
                    span,
                    redaction=not payload.get("no_redact", False),
                )
            )
        ]
        if payload.get("out"):
            Path(payload["out"]).write_text(
                "".join(json.dumps(case, sort_keys=True) + "\n" for case in cases),
                encoding="utf-8",
            )
        return {"ok": True, "case_count": len(cases), "out": payload.get("out")}
    raise ValueError(f"unsupported sidecar command: {command}")


def _sanitized_env(temp_dir: str) -> dict[str, str]:
    keep = {
        "HOME",
        "LANG",
        "LC_ALL",
        "PATH",
        "PYTHONPATH",
        "SYSTEMROOT",
        "USERPROFILE",
        "WINDIR",
    }
    env = {key: value for key, value in os.environ.items() if key in keep}
    env["TMPDIR"] = temp_dir
    env["TEMP"] = temp_dir
    env["TMP"] = temp_dir
    return env


def serve(host: str = "127.0.0.1", port: int = 8765) -> None:
    SidecarHandler.max_body_bytes = DEFAULT_MAX_SIDECAR_BODY_BYTES
    SidecarHandler.command_timeout_seconds = DEFAULT_SIDECAR_TIMEOUT_SECONDS
    ThreadingHTTPServer((host, port), SidecarHandler).serve_forever()
