from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import tempfile
import time
from pathlib import Path
from typing import Iterator

from agentstudio.trace_store import TraceStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Benchmark Agent Studio .ast FTS search latency.")
    parser.add_argument("--rows", type=int, default=10_000, help="Number of turn rows to seed.")
    parser.add_argument("--limit-ms", type=float, default=200.0, help="Maximum allowed FTS search latency.")
    parser.add_argument("--store", type=Path, help="Optional store path; defaults to a temporary .ast file.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable results.")
    args = parser.parse_args(argv)

    if args.rows < 1:
        parser.error("--rows must be positive")

    with tempfile.TemporaryDirectory(prefix="agentstudio-bench-") as tmp:
        store_path = args.store or Path(tmp) / "trace-search.ast"
        result = run_benchmark(store_path, args.rows, args.limit_ms)

    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(
            "rows={rows} seed_ms={seed_ms:.2f} search_ms={search_ms:.2f} "
            "limit_ms={limit_ms:.2f} hit_count={hit_count}".format(**result)
        )
    return 0 if result["passed"] else 1


def run_benchmark(store_path: Path, rows: int, limit_ms: float) -> dict[str, float | int | bool | str]:
    store = TraceStore(store_path)
    try:
        session_id = store.create_session("performance benchmark", server="bench", model="local", session_id="perf-session")
        seed_started = time.perf_counter()
        seed_turns(store.conn, session_id, rows)
        seed_ms = (time.perf_counter() - seed_started) * 1000

        search_started = time.perf_counter()
        hits = store.search("needleperf", limit=20)
        search_ms = (time.perf_counter() - search_started) * 1000
    finally:
        store.close()

    return {
        "rows": rows,
        "store": str(store_path),
        "seed_ms": round(seed_ms, 3),
        "search_ms": round(search_ms, 3),
        "limit_ms": limit_ms,
        "hit_count": len(hits),
        "passed": bool(hits) and search_ms <= limit_ms,
    }


def seed_turns(conn: sqlite3.Connection, session_id: str, rows: int) -> None:
    conn.execute("BEGIN")
    try:
        for batch_start in range(0, rows, 10_000):
            batch_end = min(batch_start + 10_000, rows)
            turn_rows = list(_turn_rows(session_id, batch_start, batch_end, rows))
            conn.executemany(
                "INSERT INTO turns (session_id, ordinal, role, content_json, parent_turn_id) VALUES (?, ?, ?, ?, ?)",
                turn_rows,
            )
            conn.executemany(
                "INSERT INTO trace_fts (session_id, kind, content) VALUES (?, ?, ?)",
                ((row[0], f"turn:{row[2]}", row[3]) for row in turn_rows),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def _turn_rows(session_id: str, start: int, end: int, total: int) -> Iterator[tuple[str, int, str, str, None]]:
    needle_at = total // 2
    for ordinal in range(start, end):
        marker = " needleperf" if ordinal == needle_at else ""
        content = {"ordinal": ordinal, "message": f"benchmark turn {ordinal}{marker}"}
        yield (session_id, ordinal, "assistant", json.dumps(content, separators=(",", ":")), None)


if __name__ == "__main__":
    sys.exit(main())
