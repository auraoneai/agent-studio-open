from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .agent_card import load_json, validate_agent_card
from .assertions import validate_transcript
from .client import load_transcript
from .report import build_result, render_json, render_markdown


def run(args: argparse.Namespace) -> int:
    card = load_json(args.agent_card)
    if not isinstance(card, dict):
        raise SystemExit("agent card must be a JSON object")
    transcript = load_transcript(args.agent_card, args.transcript)
    findings = validate_agent_card(card) + validate_transcript(card, transcript)
    result = build_result(card, transcript, findings)
    output = render_json(result) if args.format == "json" else render_markdown(result)
    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)
    return 0 if result["passed"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="a2a-contract-test")
    sub = parser.add_subparsers(dest="command", required=True)
    run_parser = sub.add_parser("run", help="run contract checks")
    run_parser.add_argument("--agent-card", required=True)
    run_parser.add_argument("--transcript")
    run_parser.add_argument("--out")
    run_parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    run_parser.set_defaults(func=run)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

