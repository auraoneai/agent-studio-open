from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  server TEXT,
  model TEXT,
  started_at TEXT,
  ended_at TEXT,
  outcome TEXT,
  cost REAL DEFAULT 0,
  latency REAL DEFAULT 0,
  tags TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  parent_turn_id INTEGER
);
CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id INTEGER REFERENCES turns(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  latency REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  cost REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  data_blob BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS metadata (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY(session_id, key)
);
CREATE VIRTUAL TABLE IF NOT EXISTS trace_fts USING fts5(session_id, kind, content);
CREATE INDEX IF NOT EXISTS idx_turns_session_ord ON turns(session_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session_ord ON tool_calls(session_id, ordinal);
"""


@dataclass(frozen=True)
class SearchHit:
    session_id: str
    kind: str
    snippet: str

    def to_dict(self) -> dict[str, str]:
        return {"session_id": self.session_id, "kind": self.kind, "snippet": self.snippet}


class TraceStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.close()

    def create_session(
        self,
        name: str,
        server: str = "",
        model: str = "",
        outcome: str = "unknown",
        started_at: str | None = None,
        ended_at: str | None = None,
        tags: list[str] | None = None,
        session_id: str | None = None,
    ) -> str:
        sid = session_id or str(uuid.uuid4())
        self.conn.execute(
            "INSERT OR REPLACE INTO sessions (id, name, server, model, started_at, ended_at, outcome, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (sid, name, server, model, started_at, ended_at, outcome, json.dumps(tags or [])),
        )
        self.conn.commit()
        return sid

    def add_turn(self, session_id: str, ordinal: int, role: str, content: Any, parent_turn_id: int | None = None) -> int:
        payload = _json(content)
        cursor = self.conn.execute(
            "INSERT INTO turns (session_id, ordinal, role, content_json, parent_turn_id) VALUES (?, ?, ?, ?, ?)",
            (session_id, ordinal, role, payload, parent_turn_id),
        )
        self.conn.execute("INSERT INTO trace_fts (session_id, kind, content) VALUES (?, ?, ?)", (session_id, f"turn:{role}", payload))
        self.conn.commit()
        return int(cursor.lastrowid)

    def add_tool_call(
        self,
        session_id: str,
        ordinal: int,
        tool_name: str,
        input_json: Any,
        output_json: Any = None,
        status: str = "ok",
        latency: float = 0,
        cost: float = 0,
        turn_id: int | None = None,
    ) -> int:
        input_payload = _json(input_json)
        output_payload = _json(output_json)
        cursor = self.conn.execute(
            """
            INSERT INTO tool_calls (session_id, turn_id, ordinal, tool_name, input_json, output_json, latency, status, cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, turn_id, ordinal, tool_name, input_payload, output_payload, latency, status, cost),
        )
        self.conn.execute(
            "INSERT INTO trace_fts (session_id, kind, content) VALUES (?, ?, ?)",
            (session_id, "tool_call", f"{tool_name}\n{input_payload}\n{output_payload}"),
        )
        self.conn.commit()
        return int(cursor.lastrowid)

    def set_metadata(self, session_id: str, key: str, value: Any) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO metadata (session_id, key, value) VALUES (?, ?, ?)",
            (session_id, key, _json(value)),
        )
        self.conn.commit()

    def search(self, query: str, limit: int = 20) -> list[SearchHit]:
        rows = self.conn.execute(
            """
            SELECT session_id, kind, snippet(trace_fts, 2, '[', ']', ' ... ', 12) AS snippet
            FROM trace_fts
            WHERE trace_fts MATCH ?
            LIMIT ?
            """,
            (query, limit),
        ).fetchall()
        return [SearchHit(row["session_id"], row["kind"], row["snippet"]) for row in rows]

    def session_replay(self, session_id: str) -> dict[str, Any]:
        session = self.conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if session is None:
            raise KeyError(session_id)
        events: list[dict[str, Any]] = []
        for row in self.conn.execute("SELECT * FROM tool_calls WHERE session_id = ? ORDER BY ordinal, id", (session_id,)):
            events.append({"type": "tool_call", "tool_name": row["tool_name"], "arguments": json.loads(row["input_json"] or "{}")})
            events.append({"type": "tool_result", "tool_name": row["tool_name"], "output": json.loads(row["output_json"] or "null")})
        return {
            "schema_version": "tool-call-replay/v1",
            "trace_id": session_id,
            "goal": session["name"],
            "events": events,
            "final_answer": None,
        }

    def first_session_id(self) -> str:
        row = self.conn.execute("SELECT id FROM sessions ORDER BY started_at, id LIMIT 1").fetchone()
        if row is None:
            raise KeyError("trace store has no sessions")
        return str(row["id"])

    def tool_sequence(self, session_id: str | None = None) -> list[dict[str, Any]]:
        sid = session_id or self.first_session_id()
        rows = self.conn.execute("SELECT * FROM tool_calls WHERE session_id = ? ORDER BY ordinal, id", (sid,)).fetchall()
        return [
            {
                "tool_name": row["tool_name"],
                "arguments": json.loads(row["input_json"] or "{}"),
                "output": json.loads(row["output_json"] or "null"),
                "status": row["status"],
            }
            for row in rows
        ]


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
