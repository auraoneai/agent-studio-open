import json
import os
import subprocess
import sys
from pathlib import Path

from mcp_risk_linter import scan_path
from mcp_risk_linter.report import render_report

ROOT = Path(__file__).resolve().parents[1]


def test_safe_fixture_has_no_medium_or_high_findings():
    report = scan_path(ROOT / "examples/safe_server")
    assert report.failing_findings("medium") == []
    assert {tool.name for tool in report.tools} >= {"read_project_summary", "list_fixture_labels"}


def test_risky_fixture_reports_shell_secret_and_docs_findings():
    report = scan_path(ROOT / "examples/risky_stdio_server")
    rule_ids = {finding.rule_id for finding in report.findings}
    assert {"MCP001", "MCP004", "MCP005", "MCP007", "MCP008"}.issubset(rule_ids)
    assert report.failing_findings("high")


def test_broad_filesystem_fixture_reports_filesystem_and_network():
    report = scan_path(ROOT / "examples/broad_filesystem_server")
    rule_ids = {finding.rule_id for finding in report.findings}
    assert "MCP002" in rule_ids
    assert "MCP003" in rule_ids


def test_inline_suppression_requires_rule_and_justification(tmp_path):
    (tmp_path / "README.md").write_text("## Security\nUses explicit auth scopes.\n", encoding="utf8")
    (tmp_path / "server.py").write_text(
        "# mcp-risk-linter: ignore MCP001 -- tutorial fixture intentionally shells out\n"
        "os.system('echo fixture')\n",
        encoding="utf8",
    )
    report = scan_path(tmp_path)
    assert "MCP001" not in {finding.rule_id for finding in report.findings}


def test_markdown_json_and_sarif_render():
    report = scan_path(ROOT / "examples/risky_stdio_server")
    markdown = render_report(report, "markdown")
    assert "# MCP Risk Lint Report" in markdown
    payload = json.loads(render_report(report, "json"))
    assert payload["finding_count"] >= 5
    sarif = json.loads(render_report(report, "sarif"))
    assert sarif["version"] == "2.1.0"


def test_cli_scan_writes_report_and_fails_on_high(tmp_path):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    out = tmp_path / "report.json"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "mcp_risk_linter.cli",
            "scan",
            str(ROOT / "examples/risky_stdio_server"),
            "--format",
            "json",
            "--out",
            str(out),
            "--fail-on",
            "high",
        ],
        text=True,
        capture_output=True,
        env=env,
    )
    assert proc.returncode == 1
    assert json.loads(out.read_text())["finding_count"] >= 5


def test_cli_scan_safe_fixture_passes_medium_threshold():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "mcp_risk_linter.cli",
            "scan",
            str(ROOT / "examples/safe_server"),
            "--fail-on",
            "medium",
        ],
        text=True,
        capture_output=True,
        env=env,
    )
    assert proc.returncode == 0, proc.stderr + proc.stdout
