from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .report import render_report
from .rules import SEVERITY_ORDER
from .scanner import scan_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mcp-risk-linter")
    sub = parser.add_subparsers(dest="command", required=True)
    scan = sub.add_parser("scan", help="scan an MCP server repository")
    scan.add_argument("path", nargs="?", default=".", help="repository path to scan")
    scan.add_argument("--format", choices=["markdown", "json", "sarif"], default="markdown")
    scan.add_argument("--out", help="write report to file")
    scan.add_argument("--fail-on", choices=list(SEVERITY_ORDER), default="high")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "scan":
        report = scan_path(args.path)
        output = render_report(report, args.format)
        if args.out:
            Path(args.out).write_text(output, encoding="utf8")
        else:
            sys.stdout.write(output)
        failing = report.failing_findings(args.fail_on)
        return 1 if failing else 0
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
