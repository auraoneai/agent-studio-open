from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[4]
MANIFEST = REPO_ROOT / "opensource" / "agent-studio-open" / "desktop" / "src-tauri" / "Cargo.toml"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Benchmark Agent Studio desktop core startup.")
    parser.add_argument("--limit-ms", type=float, default=2_000.0, help="Maximum allowed startup time.")
    parser.add_argument("--runs", type=int, default=5, help="Number of release binary startup samples.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    if args.runs < 1:
        parser.error("--runs must be positive")

    build_ms = timed(["cargo", "build", "--release", "--manifest-path", str(MANIFEST), "--bin", "agent-studio-open"])
    target_bin = REPO_ROOT / "opensource" / "agent-studio-open" / "desktop" / "src-tauri" / "target" / "release" / _binary_name()
    samples = [timed([str(target_bin)]) for _ in range(args.runs)]
    result: dict[str, Any] = {
        "build_ms": round(build_ms, 3),
        "runs": args.runs,
        "startup_ms_min": round(min(samples), 3),
        "startup_ms_max": round(max(samples), 3),
        "startup_ms_avg": round(sum(samples) / len(samples), 3),
        "limit_ms": args.limit_ms,
        "passed": max(samples) <= args.limit_ms,
    }
    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(
            "runs={runs} startup_ms_min={startup_ms_min:.2f} startup_ms_avg={startup_ms_avg:.2f} "
            "startup_ms_max={startup_ms_max:.2f} limit_ms={limit_ms:.2f}".format(**result)
        )
    return 0 if result["passed"] else 1


def timed(command: list[str]) -> float:
    started = time.perf_counter()
    completed = subprocess.run(command, capture_output=True, text=True, timeout=60)
    elapsed_ms = (time.perf_counter() - started) * 1000
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr or completed.stdout or f"command failed: {command!r}")
    return elapsed_ms


def _binary_name() -> str:
    if sys.platform == "win32":
        return "agent-studio-open.exe"
    return "agent-studio-open"


if __name__ == "__main__":
    sys.exit(main())
