from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .eval_case import span_to_eval_case
from .manifest import attach_results, build_manifest, load_cases
from .otlp_reader import load_spans


def extract(args: argparse.Namespace) -> int:
    cases = [case for span in load_spans(args.trace) if (case := span_to_eval_case(span, redaction=not args.no_redact))]
    output = "".join(json.dumps(case, sort_keys=True) + "\n" for case in cases)
    Path(args.out).write_text(output, encoding="utf-8")
    return 0


def manifest(args: argparse.Namespace) -> int:
    Path(args.out).write_text(json.dumps(build_manifest(load_cases(args.cases)), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


def attach(args: argparse.Namespace) -> int:
    results = json.loads(Path(args.results).read_text(encoding="utf-8"))
    output = attach_results(load_cases(args.cases), results)
    text = json.dumps(output, indent=2, sort_keys=True) + "\n"
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="otel-eval-bridge")
    sub = parser.add_subparsers(dest="command", required=True)
    extract_parser = sub.add_parser("extract")
    extract_parser.add_argument("trace")
    extract_parser.add_argument("--out", required=True)
    extract_parser.add_argument("--no-redact", action="store_true")
    extract_parser.set_defaults(func=extract)
    manifest_parser = sub.add_parser("manifest")
    manifest_parser.add_argument("cases")
    manifest_parser.add_argument("--out", required=True)
    manifest_parser.set_defaults(func=manifest)
    attach_parser = sub.add_parser("attach")
    attach_parser.add_argument("cases")
    attach_parser.add_argument("results")
    attach_parser.add_argument("--out")
    attach_parser.set_defaults(func=attach)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

