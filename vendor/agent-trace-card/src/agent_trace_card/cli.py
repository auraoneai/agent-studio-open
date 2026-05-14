from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .generator import generate_card
from .importers import load_trace
from .render import render_card
from .schema import validate_card


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agent-trace-card")
    sub = parser.add_subparsers(dest="command", required=True)
    gen = sub.add_parser("generate", help="generate a card from trace JSON")
    gen.add_argument("--from", dest="source", required=True)
    gen.add_argument("--out", required=True)
    gen.add_argument("--format", choices=["markdown", "json", "html"], default="markdown")
    val = sub.add_parser("validate", help="validate a card JSON file")
    val.add_argument("card")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "generate":
        card = generate_card(load_trace(args.source))
        output = render_card(card, args.format)
        Path(args.out).write_text(output, encoding="utf8")
        return 0
    if args.command == "validate":
        card = json.loads(Path(args.card).read_text(encoding="utf8"))
        errors = validate_card(card)
        if errors:
            for error in errors:
                print(error, file=sys.stderr)
            return 1
        print("valid")
        return 0
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
