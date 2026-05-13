from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from tool_call_replay.ingest import ingest_jsonl, ingest_openai_agents, ingest_otlp, ingest_phoenix
from tool_call_replay.replay import ReplayCase, ReplayEvent, load_replay


def load_replay_case(path: str | Path, fmt: str) -> ReplayCase:
    if fmt == "jsonl":
        return ingest_jsonl(path)
    if fmt == "openai":
        return ingest_openai_agents(path)
    if fmt == "otlp-json":
        return ingest_otlp(path)
    if fmt == "phoenix":
        return ingest_phoenix(path)
    if fmt == "replay":
        return load_replay(path)
    if fmt == "otlp-proto":
        return _ingest_otlp_proto(path)
    raise ValueError(f"unsupported trace format: {fmt}")


def _ingest_otlp_proto(path: str | Path) -> ReplayCase:
    data = Path(path).read_bytes()
    text = data.decode("utf-8", errors="ignore")
    trace_match = re.search(r"trace[-_ ]?id['\":= ]+([A-Za-z0-9_.:-]+)", text)
    tool_names = re.findall(r"(?:gen_ai\.tool\.name|tool_name)['\":= ]+([A-Za-z0-9_.:-]+)", text)
    events: list[ReplayEvent] = [ReplayEvent("tool_call", tool_name=name, arguments={}) for name in tool_names]
    return ReplayCase("tool-call-replay/v1", trace_match.group(1) if trace_match else "otlp-proto-trace", "", events)


def case_to_ast(case: ReplayCase, store_path: str | Path, source: str) -> str:
    from .trace_store import TraceStore

    store = TraceStore(store_path)
    try:
        session_id = store.create_session(case.goal or case.trace_id, server=source, outcome="imported", session_id=case.trace_id)
        ordinal = 0
        pending: dict[str, Any] | None = None
        for event in case.events:
            if event.event_type == "message":
                store.add_turn(session_id, ordinal, "message", event.to_dict())
                ordinal += 1
            elif event.event_type == "tool_call":
                pending = {"tool_name": event.tool_name or "unknown", "arguments": event.arguments or {}}
            elif event.event_type == "tool_result" and pending:
                store.add_tool_call(session_id, ordinal, pending["tool_name"], pending["arguments"], event.output, status="ok" if not event.error else "error")
                ordinal += 1
                pending = None
        if pending:
            store.add_tool_call(session_id, ordinal, pending["tool_name"], pending["arguments"], None, status="pending")
        store.set_metadata(session_id, "source_format", source)
        return session_id
    finally:
        store.close()


def load_a2a_card(source: str) -> dict[str, Any]:
    if source.startswith(("http://", "https://")):
        import urllib.request

        _require_url_scheme(source, {"http", "https"})
        with urllib.request.urlopen(source, timeout=10) as response:  # nosec B310
            return json.loads(response.read().decode("utf-8"))
    with Path(source).open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("A2A agent card must be a JSON object")
    return data


def _require_url_scheme(url: str, allowed: set[str]) -> None:
    scheme = urlparse(url).scheme
    if scheme not in allowed:
        raise ValueError(f"unsupported URL scheme: {scheme}")
