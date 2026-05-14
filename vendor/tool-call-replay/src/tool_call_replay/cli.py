from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .assertions import load_assertions
from .ingest import ingest_jsonl, ingest_openai_agents, ingest_otlp, ingest_phoenix
from .pytest_gen import write_pytest
from .replay import load_replay, run_assertions, save_replay
from .report import markdown_report


INGESTERS = {
    "jsonl": ingest_jsonl,
    "openai": ingest_openai_agents,
    "otlp": ingest_otlp,
    "phoenix": ingest_phoenix,
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tool-call-replay")
    sub = parser.add_subparsers(dest="command", required=True)
    ingest = sub.add_parser("ingest", help="normalize a trace into replay JSON")
    ingest.add_argument("trace")
    ingest.add_argument("--format", choices=list(INGESTERS), default="jsonl")
    ingest.add_argument("--out", required=True)
    run = sub.add_parser("run", help="run deterministic replay assertions")
    run.add_argument("replay")
    run.add_argument("--assert", dest="assertions", required=True)
    run.add_argument("--report", help="write Markdown report")
    gen = sub.add_parser("pytest", help="generate pytest regression test")
    gen.add_argument("replay")
    gen.add_argument("--assert", dest="assertions", required=True)
    gen.add_argument("--out", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "ingest":
        case = INGESTERS[args.format](args.trace)
        save_replay(case, args.out)
        return 0
    if args.command == "run":
        case = load_replay(args.replay)
        assertions = load_assertions(args.assertions)
        results = run_assertions(case, assertions)
        if args.report:
            Path(args.report).write_text(markdown_report(case, results), encoding="utf8")
        else:
            sys.stdout.write(json.dumps([result.__dict__ for result in results], indent=2) + "\n")
        return 0 if all(result.ok for result in results) else 1
    if args.command == "pytest":
        case = load_replay(args.replay)
        assertions = load_assertions(args.assertions)
        write_pytest(case, assertions, args.out)
        return 0
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
