from __future__ import annotations

import json
import sys


TOOLS = [
    {
        "name": "lookup_order",
        "description": "Read-only lookup for an order by id.",
        "inputSchema": {"type": "object", "properties": {"order_id": {"type": "string"}}, "required": ["order_id"]},
    }
]


def read_message() -> dict:
    headers = b""
    while b"\r\n\r\n" not in headers:
        chunk = sys.stdin.buffer.read(1)
        if not chunk:
            raise EOFError
        headers += chunk
    length = 0
    for line in headers.decode("ascii").splitlines():
        if line.lower().startswith("content-length:"):
            length = int(line.split(":", 1)[1].strip())
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


def write_message(payload: dict) -> None:
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(b"Content-Length: " + str(len(data)).encode("ascii") + b"\r\n\r\n" + data)
    sys.stdout.buffer.flush()


while True:
    try:
        request = read_message()
    except EOFError:
        break
    method = request.get("method")
    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "serverInfo": {"name": "fixture", "version": "0.1.0"}, "capabilities": {"tools": {}}}
    elif method == "tools/list":
        result = {"tools": TOOLS}
    elif method == "resources/list":
        result = {"resources": []}
    elif method == "prompts/list":
        result = {"prompts": []}
    else:
        result = {}
    write_message({"jsonrpc": "2.0", "id": request.get("id"), "result": result})
