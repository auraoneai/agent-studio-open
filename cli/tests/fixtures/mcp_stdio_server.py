from __future__ import annotations

import json
import os
import sys
import time


TOOLS = [
    {
        "name": "lookup_order",
        "description": "Read-only lookup for an order by id.",
        "inputSchema": {"type": "object", "properties": {"order_id": {"type": "string"}}, "required": ["order_id"]},
    }
]

# FIXTURE_MODE: "" (newline-delimited JSON-RPC), "exit" (exit before responding),
# "lsp" (answer with legacy Content-Length framing), "split" (each message in small chunks).
MODE = os.environ.get("FIXTURE_MODE", "")


def write_message(payload: dict) -> None:
    data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if MODE == "lsp":
        sys.stdout.buffer.write(b"Content-Length: " + str(len(data)).encode("ascii") + b"\r\n\r\n" + data)
    elif MODE == "split":
        # One message in several flushed writes, splitting inside a UTF-8 sequence.
        line = data + b"\n"
        for start in range(0, len(line), 7):
            sys.stdout.buffer.write(line[start:start + 7])
            sys.stdout.buffer.flush()
            time.sleep(0.001)
    else:
        sys.stdout.buffer.write(data + b"\n")
    sys.stdout.buffer.flush()


initialized = False
for line in sys.stdin.buffer:
    if not line.strip():
        continue
    request = json.loads(line)
    method = request.get("method")
    if "id" not in request:
        # Notifications such as notifications/initialized get no response.
        initialized = initialized or method == "notifications/initialized"
        continue
    if MODE == "exit":
        sys.stderr.write("fixture exiting before response\n")
        sys.stderr.flush()
        sys.exit(3)
    if method != "initialize" and not initialized:
        write_message({"jsonrpc": "2.0", "id": request.get("id"), "error": {"code": -32600, "message": "not initialized"}})
        continue
    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "serverInfo": {"name": "fixture", "version": "0.1.0"}, "capabilities": {"tools": {}}}
    elif method == "tools/list":
        result = {"tools": TOOLS}
    elif method == "resources/list":
        result = {"resources": []}
    elif method == "prompts/list":
        result = {"prompts": []}
    elif method == "ping":
        result = {}
    elif method == "tools/call":
        params = request.get("params") or {}
        if params.get("name") != "lookup_order":
            result = {"content": [{"type": "text", "text": f"unknown tool {params.get('name')}"}], "isError": True}
        else:
            text = json.dumps(params.get("arguments") or {}, ensure_ascii=False, sort_keys=True)
            result = {"content": [{"type": "text", "text": text}], "isError": False}
    else:
        write_message({"jsonrpc": "2.0", "id": request.get("id"), "error": {"code": -32601, "message": f"method not found: {method}"}})
        continue
    # Interleave a server notification before each response to exercise client-side skipping.
    write_message({"jsonrpc": "2.0", "method": "notifications/message", "params": {"level": "info", "data": f"handling {method}"}})
    write_message({"jsonrpc": "2.0", "id": request.get("id"), "result": result})
