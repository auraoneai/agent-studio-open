from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OPEN_SOURCE_ROOT = ROOT.parents[1]
DEFAULT_FIXTURE = ROOT / "tests" / "fixtures" / "mcp_stdio_server.py"
PYTHONPATH_PARTS = [
    ROOT / "src",
    OPEN_SOURCE_ROOT / "mcp-risk-linter" / "src",
    OPEN_SOURCE_ROOT / "a2a-contract-test" / "src",
    OPEN_SOURCE_ROOT / "tool-call-replay" / "src",
    OPEN_SOURCE_ROOT / "agent-trace-card" / "src",
    OPEN_SOURCE_ROOT / "otel-eval-bridge" / "src",
]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Benchmark Agent Studio CLI startup and MCP connect latency.")
    parser.add_argument("--self-test-limit-ms", type=float, default=2_000.0)
    parser.add_argument("--connect-limit-ms", type=float, default=500.0)
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(str(path) for path in PYTHONPATH_PARTS)
    self_test = timed_command([sys.executable, "-m", "agentstudio.cli", "--json", "self-test"], env)
    connect = timed_command(
        [
            sys.executable,
            "-m",
            "agentstudio.cli",
            "--json",
            "connect",
            "stdio",
            "--command",
            sys.executable,
            "--arg",
            str(args.fixture),
        ],
        env,
    )
    result: dict[str, Any] = {
        "self_test_ms": round(self_test["elapsed_ms"], 3),
        "self_test_limit_ms": args.self_test_limit_ms,
        "connect_ms": round(connect["elapsed_ms"], 3),
        "connect_limit_ms": args.connect_limit_ms,
        "passed": self_test["ok"] and connect["ok"] and self_test["elapsed_ms"] <= args.self_test_limit_ms and connect["elapsed_ms"] <= args.connect_limit_ms,
    }
    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(
            "self_test_ms={self_test_ms:.2f} self_test_limit_ms={self_test_limit_ms:.2f} "
            "connect_ms={connect_ms:.2f} connect_limit_ms={connect_limit_ms:.2f}".format(**result)
        )
    return 0 if result["passed"] else 1


def timed_command(command: list[str], env: dict[str, str]) -> dict[str, Any]:
    started = time.perf_counter()
    completed = subprocess.run(command, env=env, capture_output=True, text=True, timeout=10)
    elapsed_ms = (time.perf_counter() - started) * 1000
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr or completed.stdout or f"command failed: {command!r}")
    return {"ok": True, "elapsed_ms": elapsed_ms}


if __name__ == "__main__":
    sys.exit(main())
