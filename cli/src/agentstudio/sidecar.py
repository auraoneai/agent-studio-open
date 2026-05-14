from __future__ import annotations

import json
import subprocess  # nosec B404
import sys
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


def bootstrap_venv(path: str | Path, requirements: str | Path | None = None) -> dict[str, Any]:
    target = Path(path)
    builder = venv.EnvBuilder(with_pip=True, clear=False)
    builder.create(target)
    python = target / ("Scripts/python.exe" if sys.platform.startswith("win") else "bin/python")
    installed = False
    if requirements:
        # sidecar bootstrap intentionally invokes local pip with shell=False.
        subprocess.run([str(python), "-m", "pip", "install", "-r", str(requirements)], check=True)  # nosec B603
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

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_error(404)
            return
        self._json(health())

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        command = self.path.strip("/")
        if command == "risk-scan":
            from mcp_risk_linter.report import render_report
            from mcp_risk_linter.scanner import scan_path

            report = scan_path(payload["path"])
            self._json(json.loads(render_report(report, "json")))
            return
        if command == "a2a":
            from a2a_contract_test.agent_card import validate_agent_card
            from a2a_contract_test.assertions import validate_transcript
            from a2a_contract_test.report import build_result

            card = payload["card"]
            transcript = payload.get("transcript", [])
            self._json(build_result(card, transcript, validate_agent_card(card) + validate_transcript(card, transcript)))
            return
        if command == "trace-card":
            from agent_trace_card.generator import generate_card
            from agent_trace_card.importers import load_trace
            from agent_trace_card.render import render_card

            card = generate_card(load_trace(payload["trace"]))
            output = render_card(card, payload.get("format", "markdown"))
            if payload.get("out"):
                Path(payload["out"]).write_text(output, encoding="utf-8")
            self._json({"ok": True, "out": payload.get("out"), "format": payload.get("format", "markdown")})
            return
        if command == "otel-extract":
            from otel_eval_bridge.eval_case import span_to_eval_case
            from otel_eval_bridge.otlp_reader import load_spans

            cases = [case for span in load_spans(payload["trace"]) if (case := span_to_eval_case(span, redaction=not payload.get("no_redact", False)))]
            if payload.get("out"):
                Path(payload["out"]).write_text("".join(json.dumps(case, sort_keys=True) + "\n" for case in cases), encoding="utf-8")
            self._json({"ok": True, "case_count": len(cases), "out": payload.get("out")})
            return
        self.send_error(404)

    def log_message(self, format: str, *args: Any) -> None:
        return None

    def _json(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def serve(host: str = "127.0.0.1", port: int = 8765) -> None:
    ThreadingHTTPServer((host, port), SidecarHandler).serve_forever()
