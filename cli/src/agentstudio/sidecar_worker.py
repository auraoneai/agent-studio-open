from __future__ import annotations

import json
import sys

from .sidecar import execute_engine_command


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python -m agentstudio.sidecar_worker <command>", file=sys.stderr)
        return 2
    try:
        payload = json.load(sys.stdin)
        result = execute_engine_command(sys.argv[1], payload)
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1
    json.dump(result, sys.stdout, sort_keys=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
