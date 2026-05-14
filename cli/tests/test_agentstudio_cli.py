from __future__ import annotations

import base64
import hashlib
import json
import socket
import struct
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from agentstudio.cli import main
from agentstudio.importers import load_replay_case
from agentstudio.mcp import RemoteAuthConfig
from agentstudio.otlp_receiver import DEFAULT_MAX_OTLP_PAYLOAD_BYTES, OTLPHandler, start_otlp_grpc
from agentstudio.trace_store import TraceStore


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"


def test_stdio_mcp_connect_smoke(capsys):
    code = main(["--json", "connect", "stdio", "--command", sys.executable, "--arg", str(FIXTURES / "mcp_stdio_server.py")])
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["transport"] == "stdio"
    assert payload["tools"][0]["name"] == "lookup_order"


def test_http_sse_and_websocket_mcp_connect_smoke(capsys):
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _MCPHTTPHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_address[1]
    assert main(["--json", "connect", "http", f"http://127.0.0.1:{port}/mcp"]) == 0
    assert json.loads(capsys.readouterr().out)["tools"][0]["name"] == "lookup_order"
    assert main(["--json", "connect", "sse", f"http://127.0.0.1:{port}/sse", "--post-url", f"http://127.0.0.1:{port}/mcp"]) == 0
    assert json.loads(capsys.readouterr().out)["transport"] == "sse"
    httpd.shutdown()

    ws_server = _WebSocketFixture()
    ws_server.start()
    assert main(["--json", "connect", "ws", f"ws://127.0.0.1:{ws_server.port}/mcp"]) == 0
    assert json.loads(capsys.readouterr().out)["transport"] == "ws"
    ws_server.stop()


def test_http_remote_auth_oauth_metadata_and_headers(capsys):
    _AuthMCPHTTPHandler.metadata_requests = 0
    _AuthMCPHTTPHandler.seen_authorization = []
    _AuthMCPHTTPHandler.seen_client = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _AuthMCPHTTPHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_address[1]

    try:
        assert (
            main(
                [
                    "--json",
                    "connect",
                    "http",
                    f"http://127.0.0.1:{port}/mcp",
                    "--oauth-resource-metadata-url",
                    f"http://127.0.0.1:{port}/.well-known/oauth-protected-resource",
                    "--oauth-access-token",
                    "remote-token",
                    "--header",
                    "x-agentstudio-client=test",
                ]
            )
            == 0
        )
        payload = json.loads(capsys.readouterr().out)
        assert payload["tools"][0]["name"] == "lookup_order"
        assert _AuthMCPHTTPHandler.metadata_requests == 1
        assert _AuthMCPHTTPHandler.seen_authorization == ["Bearer remote-token"] * 4
        assert _AuthMCPHTTPHandler.seen_client == ["test"] * 4
    finally:
        httpd.shutdown()


def test_remote_auth_builds_mtls_context():
    with patch("ssl.SSLContext.load_cert_chain") as load_cert_chain:
        context = RemoteAuthConfig(mtls_cert="client.pem", mtls_key="client-key.pem").ssl_context()
    assert context is not None
    load_cert_chain.assert_called_once_with("client.pem", "client-key.pem")


def test_a2a_loader_contract_json(capsys):
    code = main(
        [
            "--json",
            "a2a",
            str(FIXTURES / "passing-agent-card.json"),
            "--transcript",
            str(FIXTURES / "passing-transcript.json"),
        ]
    )
    assert code == 0
    assert json.loads(capsys.readouterr().out)["passed"] is True


def test_import_openai_otlp_phoenix_and_search(tmp_path, capsys):
    store = tmp_path / "traces.ast"
    assert main(["--json", "import-trace", str(FIXTURES / "openai_events.jsonl"), "--format", "openai", "--store", str(store)]) == 0
    assert main(["--json", "import-trace", str(FIXTURES / "otlp_trace.json"), "--format", "otlp-json", "--store", str(store)]) == 0
    assert main(["--json", "import-trace", str(FIXTURES / "phoenix_export.json"), "--format", "phoenix", "--store", str(store)]) == 0
    capsys.readouterr()
    assert main(["--json", "store", "search", str(store), "refund"]) == 0
    hits = json.loads(capsys.readouterr().out)
    assert hits
    trace_store = TraceStore(store)
    try:
        assert trace_store.search("lookup_order")
    finally:
        trace_store.close()


def test_otlp_proto_import(tmp_path):
    proto = tmp_path / "trace.pb"
    proto.write_bytes(b'trace_id="proto-fixture" gen_ai.tool.name="lookup_order"')
    case = load_replay_case(proto, "otlp-proto")
    assert case.trace_id == "proto-fixture"
    assert [event.tool_name for event in case.events] == ["lookup_order"]


def test_replay_diff_and_exports(tmp_path, capsys):
    store_a = tmp_path / "a.ast"
    store_b = tmp_path / "b.ast"
    for store in (store_a, store_b):
        assert main(["--json", "import-trace", str(FIXTURES / "openai_events.jsonl"), "--format", "openai", "--store", str(store)]) == 0
    capsys.readouterr()
    assert main(["--json", "compare", "--baseline", str(store_a), "--candidate", str(store_b)]) == 0
    assert json.loads(capsys.readouterr().out)["passed"] is True

    export_dir = tmp_path / "gh"
    assert main(["--json", "export", "gh-action", str(FIXTURES / "regressions"), "--out", str(export_dir)]) == 0
    assert (export_dir / ".github" / "workflows" / "agent-regression.yml").exists()
    assert (export_dir / "regressions" / "refund.json").exists()

    junit_results = tmp_path / "results.json"
    junit_results.write_text(json.dumps([{"name": "refund", "ok": True, "detail": "ok"}]), encoding="utf-8")
    assert main(["--json", "export", "junit", str(junit_results), "--out", str(tmp_path / "junit.xml")]) == 0
    assert "<testsuite" in (tmp_path / "junit.xml").read_text(encoding="utf-8")

    assert main(["--json", "export", "pr-comment", str(store_a), "--out", str(tmp_path / "comment.md")]) == 0
    assert "Agent Studio Trace" in (tmp_path / "comment.md").read_text(encoding="utf-8")
    assert main(["--json", "export", "intake", str(store_a), "--out", str(tmp_path / "intake.zip"), "--suite", str(FIXTURES / "regressions")]) == 0
    assert (tmp_path / "intake.zip").exists()

    phoenix_out = tmp_path / "phoenix.json"
    assert main(["--json", "export", "phoenix-json", str(store_a), "--out", str(phoenix_out)]) == 0
    phoenix_payload = json.loads(phoenix_out.read_text(encoding="utf-8"))
    assert phoenix_payload["schema"] == "phoenix.trace.v1"
    assert phoenix_payload["spans"][0]["attributes"]["gen_ai.tool.name"] == "lookup_order"

    replay_out = tmp_path / "replay.json"
    assert main(["--json", "store", "dump-replay", str(store_a), "--out", str(replay_out)]) == 0
    assert json.loads(replay_out.read_text(encoding="utf-8"))["events"]

    card_out = tmp_path / "trace-card.md"
    assert main(["--json", "export", "trace-card", "../../agent-trace-card/examples/refund_trace.json", "--out", str(card_out)]) == 0
    assert "Agent Trace Card" in card_out.read_text(encoding="utf-8")


def test_otlp_http_json_and_grpc_style_proto_receiver(tmp_path):
    store = tmp_path / "live.ast"
    OTLPHandler.store_path = store
    OTLPHandler.once = False
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), OTLPHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_address[1]
    json_request = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/traces",
        data=(FIXTURES / "otlp_trace.json").read_bytes(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(json_request, timeout=10) as response:
        assert response.status == 200
    proto_request = urllib.request.Request(
        f"http://127.0.0.1:{port}/opentelemetry.proto.collector.trace.v1.TraceService/Export",
        data=b'trace_id="grpc-fixture" gen_ai.tool.name="lookup_order"',
        headers={"content-type": "application/grpc+proto"},
        method="POST",
    )
    with urllib.request.urlopen(proto_request, timeout=10) as response:
        assert response.status == 200
    httpd.shutdown()
    trace_store = TraceStore(store)
    try:
        assert trace_store.search("lookup_order")
    finally:
        trace_store.close()


def test_otlp_http_rejects_malformed_and_abusive_payloads(tmp_path):
    store = tmp_path / "abuse.ast"
    OTLPHandler.store_path = store
    OTLPHandler.once = False
    OTLPHandler.received = 0
    OTLPHandler.max_payload_bytes = 32
    OTLPHandler.auth_token = None
    OTLPHandler.rate_limit_per_minute = 120
    OTLPHandler.request_times = {}
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), OTLPHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_address[1]

    try:
        _assert_otlp_http_error(port, b"{bad json", "application/json", 400)
        _assert_otlp_http_error(port, b"trace", "text/plain", 415)
        _assert_otlp_http_error(port, b"x" * 33, "application/json", 413)
        assert OTLPHandler.received == 0
        assert not store.exists()
    finally:
        OTLPHandler.max_payload_bytes = DEFAULT_MAX_OTLP_PAYLOAD_BYTES
        OTLPHandler.auth_token = None
        OTLPHandler.request_times = {}
        httpd.shutdown()


def test_real_otlp_grpc_receiver(tmp_path):
    import grpc

    store = tmp_path / "grpc.ast"
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = start_otlp_grpc(store, port=port)
    try:
        channel = grpc.insecure_channel(f"127.0.0.1:{port}")
        export = channel.unary_unary(
            "/opentelemetry.proto.collector.trace.v1.TraceService/Export",
            request_serializer=lambda payload: payload,
            response_deserializer=lambda payload: payload,
        )
        assert export(b'trace_id="grpc-real-fixture" gen_ai.tool.name="lookup_order"', timeout=5) == b""
    finally:
        server.stop(0)
    trace_store = TraceStore(store)
    try:
        assert trace_store.search("lookup_order")
    finally:
        trace_store.close()


def _assert_otlp_http_error(port: int, payload: bytes, content_type: str, expected_status: int) -> None:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/traces",
        data=payload,
        headers={"content-type": content_type},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as error:
        assert error.code == expected_status
    else:
        raise AssertionError(f"expected OTLP HTTP {expected_status}")


def test_sidecar_self_test_and_model_dry_run(capsys):
    assert main(["--json", "self-test"]) == 0
    assert json.loads(capsys.readouterr().out)["ok"] is True
    assert main(["--json", "model", "--provider", "openai", "--model", "gpt-test", "--prompt", "hello", "--dry-run"]) == 0
    assert "[dry-run:openai/gpt-test]" in json.loads(capsys.readouterr().out)["text"]
    assert main(["--json", "model", "--provider", "openai", "--model", "gpt-test", "--prompt", "hello stream", "--dry-run", "--stream"]) == 0
    stream_events = json.loads(capsys.readouterr().out)
    assert stream_events[0]["type"] == "delta"
    assert stream_events[-1]["type"] == "done"


def test_risk_scan_and_sidecar_venv_bootstrap(tmp_path, capsys):
    assert main(["--json", "risk-scan", "../../mcp-risk-linter/examples/safe_server", "--fail-on", "high"]) == 0
    assert "safe_server" in json.loads(capsys.readouterr().out)["root"]
    venv_path = tmp_path / "venv"
    assert main(["--json", "sidecar", "bootstrap", "--venv", str(venv_path)]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert Path(payload["python"]).exists()


def test_otel_bridge_wrapper(tmp_path, capsys):
    out = tmp_path / "cases.jsonl"
    assert main(["--json", "otel-bridge", "extract", "../../otel-eval-bridge/examples/genai_trace.json", "--out", str(out)]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["case_count"] >= 1
    assert "trace-1" in out.read_text(encoding="utf-8")


class _MCPHTTPHandler(BaseHTTPRequestHandler):
    last_request = {"id": 1, "method": "initialize"}

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        request = json.loads(self.rfile.read(length).decode("utf-8"))
        type(self).last_request = request
        self._json(_mcp_response(request))

    def do_GET(self):
        if self.path != "/sse":
            self.send_error(404)
            return
        payload = json.dumps(_mcp_response(type(self).last_request)).encode("utf-8")
        body = b"data: " + payload + b"\n\n"
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return None

    def _json(self, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class _AuthMCPHTTPHandler(BaseHTTPRequestHandler):
    metadata_requests = 0
    seen_authorization: list[str] = []
    seen_client: list[str] = []

    def do_GET(self):
        if self.path != "/.well-known/oauth-protected-resource":
            self.send_error(404)
            return
        type(self).metadata_requests += 1
        self._json(
            {
                "resource": f"http://{self.headers.get('host')}/mcp",
                "authorization_servers": [f"http://{self.headers.get('host')}/oauth"],
                "scopes_supported": ["mcp:tools"],
            }
        )

    def do_POST(self):
        authorization = self.headers.get("authorization")
        if authorization != "Bearer remote-token":
            self.send_response(401)
            self.send_header("www-authenticate", 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource"')
            self.end_headers()
            return
        type(self).seen_authorization.append(authorization)
        type(self).seen_client.append(self.headers.get("x-agentstudio-client", ""))
        length = int(self.headers.get("content-length", "0"))
        request = json.loads(self.rfile.read(length).decode("utf-8"))
        self._json(_mcp_response(request))

    def log_message(self, format, *args):
        return None

    def _json(self, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def _mcp_response(request):
    method = request.get("method")
    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "serverInfo": {"name": "fixture"}}
    elif method == "tools/list":
        result = {"tools": [{"name": "lookup_order", "description": "Read-only lookup", "inputSchema": {"type": "object"}}]}
    elif method == "resources/list":
        result = {"resources": []}
    elif method == "prompts/list":
        result = {"prompts": []}
    else:
        result = {}
    return {"jsonrpc": "2.0", "id": request.get("id"), "result": result}


class _WebSocketFixture:
    def __init__(self):
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(1)
        self.port = self.sock.getsockname()[1]
        self.thread = threading.Thread(target=self._serve, daemon=True)

    def start(self):
        self.thread.start()

    def stop(self):
        self.sock.close()

    def _serve(self):
        conn, _addr = self.sock.accept()
        with conn:
            request = conn.recv(4096).decode("latin1")
            key = next(line.split(":", 1)[1].strip() for line in request.splitlines() if line.lower().startswith("sec-websocket-key:"))
            accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")).digest()).decode("ascii")
            conn.sendall(
                (
                    "HTTP/1.1 101 Switching Protocols\r\n"
                    "Upgrade: websocket\r\n"
                    "Connection: Upgrade\r\n"
                    f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
                ).encode("ascii")
            )
            while True:
                try:
                    request_payload = json.loads(_recv_client_text(conn))
                except Exception:
                    break
                _send_server_text(conn, json.dumps(_mcp_response(request_payload)))


def _recv_client_text(conn):
    first = conn.recv(2)
    if not first:
        raise EOFError
    length = first[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", conn.recv(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", conn.recv(8))[0]
    mask = conn.recv(4)
    payload = conn.recv(length)
    return bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload)).decode("utf-8")


def _send_server_text(conn, text):
    payload = text.encode("utf-8")
    header = bytearray([0x81])
    if len(payload) < 126:
        header.append(len(payload))
    else:
        header.append(126)
        header.extend(struct.pack("!H", len(payload)))
    conn.sendall(bytes(header) + payload)
