from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import socket
import ssl
import struct
import subprocess  # nosec B404
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlparse

MCP_PROTOCOL_VERSION = "2025-11-25"


class Transport(Protocol):
    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        ...

    def close(self) -> None:
        ...


@dataclass(frozen=True)
class MCPManifest:
    transport: str
    initialize: dict[str, Any]
    tools: list[dict[str, Any]]
    resources: list[dict[str, Any]]
    prompts: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "transport": self.transport,
            "initialize": self.initialize,
            "tools": self.tools,
            "resources": self.resources,
            "prompts": self.prompts,
        }


class JsonRpc:
    def __init__(self) -> None:
        self._next_id = 1
        self._lock = threading.Lock()

    def payload(self, method: str, params: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
        with self._lock:
            request_id = self._next_id
            self._next_id += 1
        payload: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id, "method": method}
        if params is not None:
            payload["params"] = params
        return request_id, payload


@dataclass(frozen=True)
class RemoteAuthConfig:
    headers: tuple[tuple[str, str], ...] = ()
    bearer_token: str | None = None
    oauth_access_token: str | None = None
    oauth_resource_metadata_url: str | None = None
    mtls_cert: str | None = None
    mtls_key: str | None = None

    def request_headers(self) -> dict[str, str]:
        headers = dict(self.headers)
        token = self.oauth_access_token or self.bearer_token
        if token:
            headers["authorization"] = f"Bearer {token}"
        return headers

    def ssl_context(self) -> ssl.SSLContext | None:
        if not self.mtls_cert:
            return None
        context = ssl.create_default_context()
        context.load_cert_chain(self.mtls_cert, self.mtls_key)
        return context

    def discover_oauth_metadata(self, timeout: float = 10) -> dict[str, Any]:
        if not self.oauth_resource_metadata_url:
            return {}
        return discover_oauth_metadata(self.oauth_resource_metadata_url, timeout=timeout, context=self.ssl_context())


class StdioTransport:
    def __init__(self, command: str, args: list[str] | None = None, cwd: str | None = None, env: dict[str, str] | None = None) -> None:
        merged_env = os.environ.copy()
        merged_env.update(env or {})
        self._rpc = JsonRpc()
        # stdio MCP intentionally launches explicit user argv with shell=False.
        self._proc = subprocess.Popen(  # nosec B603
            [command, *(args or [])],
            cwd=cwd,
            env=merged_env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        _request_id, payload = self._rpc.payload(method, params)
        if self._proc.stdin is None:
            raise RuntimeError("MCP server stdin is unavailable")
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self._proc.stdin.write(b"Content-Length: " + str(len(data)).encode("ascii") + b"\r\n\r\n" + data)
        self._proc.stdin.flush()
        if self._proc.stdout is None:
            raise RuntimeError("MCP server stdout is unavailable")
        response = _read_framed_json(self._proc.stdout)
        if "error" in response:
            raise RuntimeError(f"MCP {method} failed: {response['error']}")
        return response.get("result", response)

    def close(self) -> None:
        if self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self._proc.kill()


class HTTPTransport:
    def __init__(self, url: str, headers: dict[str, str] | None = None, timeout: float = 10, auth: RemoteAuthConfig | None = None) -> None:
        _require_url_scheme(url, {"http", "https"})
        self.url = url
        self.auth = auth or RemoteAuthConfig()
        self.headers = {**(headers or {}), **self.auth.request_headers()}
        self.context = self.auth.ssl_context()
        self.timeout = timeout
        self._rpc = JsonRpc()
        self.session_id: str | None = None
        self.oauth_metadata = self.auth.discover_oauth_metadata(timeout)

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        _request_id, payload = self._rpc.payload(method, params)
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.url,
            data=data,
            headers={
                "content-type": "application/json",
                "accept": "application/json, text/event-stream",
                "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
                **self._request_headers(),
            },
            method="POST",
        )
        try:
            with _urlopen(request, timeout=self.timeout, context=self.context) as response:
                self._capture_session_id(response.headers.get("MCP-Session-Id"))
                raw = response.read()
        except urllib.error.HTTPError as error:
            _raise_oauth_hint(error, self.timeout, self.context)
            raise
        parsed = json.loads(raw.decode("utf-8"))
        if "error" in parsed:
            raise RuntimeError(f"MCP {method} failed: {parsed['error']}")
        return parsed.get("result", parsed)

    def close(self) -> None:
        return None

    def _request_headers(self) -> dict[str, str]:
        headers = dict(self.headers)
        if self.session_id:
            headers["MCP-Session-Id"] = self.session_id
        return headers

    def _capture_session_id(self, session_id: str | None) -> None:
        if session_id:
            self.session_id = session_id


class SSETransport:
    """Pragmatic MCP SSE reader for local smoke tests and simple remote endpoints.

    The endpoint may emit JSON-RPC responses as `data: {...}` events. If a
    separate POST endpoint is supplied, requests are posted there before the
    event stream is read.
    """

    def __init__(
        self,
        url: str,
        post_url: str | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 10,
        auth: RemoteAuthConfig | None = None,
    ) -> None:
        _require_url_scheme(url, {"http", "https"})
        if post_url:
            _require_url_scheme(post_url, {"http", "https"})
        self.url = url
        self.post_url = post_url
        self.auth = auth or RemoteAuthConfig()
        self.headers = {**(headers or {}), **self.auth.request_headers()}
        self.context = self.auth.ssl_context()
        self.timeout = timeout
        self._rpc = JsonRpc()
        self.session_id: str | None = None
        self.oauth_metadata = self.auth.discover_oauth_metadata(timeout)

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        request_id, payload = self._rpc.payload(method, params)
        if self.post_url:
            data = json.dumps(payload).encode("utf-8")
            post = urllib.request.Request(
                self.post_url,
                data=data,
                headers={
                    "content-type": "application/json",
                    "accept": "application/json, text/event-stream",
                    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
                    **self._request_headers(),
                },
                method="POST",
            )
            try:
                with _urlopen(post, timeout=self.timeout, context=self.context) as response:
                    self._capture_session_id(response.headers.get("MCP-Session-Id"))
                    response.read()
            except urllib.error.HTTPError as error:
                _raise_oauth_hint(error, self.timeout, self.context)
                raise
        stream = urllib.request.Request(
            self.url,
            headers={"accept": "text/event-stream", "MCP-Protocol-Version": MCP_PROTOCOL_VERSION, **self._request_headers()},
            method="GET",
        )
        deadline = time.time() + self.timeout
        try:
            with _urlopen(stream, timeout=self.timeout, context=self.context) as response:
                for raw_line in response:
                    if time.time() > deadline:
                        break
                    line = raw_line.decode("utf-8").strip()
                    if not line.startswith("data:"):
                        continue
                    parsed = json.loads(line.removeprefix("data:").strip())
                    if parsed.get("id") not in (None, request_id):
                        continue
                    if "error" in parsed:
                        raise RuntimeError(f"MCP {method} failed: {parsed['error']}")
                    return parsed.get("result", parsed)
        except urllib.error.HTTPError as error:
            _raise_oauth_hint(error, self.timeout, self.context)
            raise
        raise TimeoutError(f"no SSE MCP response for {method}")

    def close(self) -> None:
        return None

    def _request_headers(self) -> dict[str, str]:
        headers = dict(self.headers)
        if self.session_id:
            headers["MCP-Session-Id"] = self.session_id
        return headers

    def _capture_session_id(self, session_id: str | None) -> None:
        if session_id:
            self.session_id = session_id


class WebSocketTransport:
    def __init__(self, url: str, headers: dict[str, str] | None = None, timeout: float = 10) -> None:
        self.url = url
        self.headers = headers or {}
        self.timeout = timeout
        self._rpc = JsonRpc()
        self._sock = _open_websocket(url, headers or {}, timeout)

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        _request_id, payload = self._rpc.payload(method, params)
        _ws_send_text(self._sock, json.dumps(payload))
        parsed = json.loads(_ws_recv_text(self._sock))
        if "error" in parsed:
            raise RuntimeError(f"MCP {method} failed: {parsed['error']}")
        return parsed.get("result", parsed)

    def close(self) -> None:
        self._sock.close()


def discover_manifest(transport: Transport, transport_name: str) -> MCPManifest:
    initialize = transport.request(
            "initialize",
        {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "agentstudio", "version": "0.1.0"},
        },
    )
    tools = _items(transport.request("tools/list"), "tools")
    resources = _items(transport.request("resources/list"), "resources", tolerate_missing=True)
    prompts = _items(transport.request("prompts/list"), "prompts", tolerate_missing=True)
    return MCPManifest(transport_name, initialize, tools, resources, prompts)


def _items(payload: dict[str, Any], key: str, tolerate_missing: bool = False) -> list[dict[str, Any]]:
    value = payload.get(key)
    if value is None and tolerate_missing:
        return []
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _read_framed_json(stream: Any) -> dict[str, Any]:
    headers = b""
    while b"\r\n\r\n" not in headers:
        chunk = stream.read(1)
        if not chunk:
            raise EOFError("MCP server closed stdout before response")
        headers += chunk
    length = None
    for line in headers.decode("ascii", errors="replace").splitlines():
        if line.lower().startswith("content-length:"):
            length = int(line.split(":", 1)[1].strip())
            break
    if length is None:
        raise ValueError("missing Content-Length in MCP response")
    body = stream.read(length)
    return json.loads(body.decode("utf-8"))


def discover_oauth_metadata(url: str, timeout: float = 10, context: ssl.SSLContext | None = None) -> dict[str, Any]:
    _require_url_scheme(url, {"http", "https"})
    request = urllib.request.Request(url, headers={"accept": "application/json"}, method="GET")
    with _urlopen(request, timeout=timeout, context=context) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("OAuth protected resource metadata must be a JSON object")
    return payload


def _urlopen(request: urllib.request.Request, timeout: float, context: ssl.SSLContext | None = None):
    if context is not None:
        return urllib.request.urlopen(request, timeout=timeout, context=context)  # nosec B310
    return urllib.request.urlopen(request, timeout=timeout)  # nosec B310


def _raise_oauth_hint(error: urllib.error.HTTPError, timeout: float, context: ssl.SSLContext | None) -> None:
    if error.code != 401:
        return
    metadata_url = _resource_metadata_url(error.headers.get("www-authenticate"))
    if not metadata_url:
        return
    metadata = discover_oauth_metadata(metadata_url, timeout=timeout, context=context)
    auth_servers = metadata.get("authorization_servers", [])
    scopes = metadata.get("scopes_supported", [])
    raise RuntimeError(
        "MCP server requires OAuth authorization; "
        f"resource_metadata={metadata_url!r}, authorization_servers={auth_servers!r}, scopes_supported={scopes!r}"
    ) from error


def _resource_metadata_url(header: str | None) -> str | None:
    if not header:
        return None
    match = re.search(r'resource_metadata="([^"]+)"', header)
    return match.group(1) if match else None


def _open_websocket(url: str, headers: dict[str, str], timeout: float) -> socket.socket:
    parsed = urlparse(url)
    if parsed.scheme not in {"ws", "wss"}:
        raise ValueError("WebSocket URL must start with ws:// or wss://")
    port = parsed.port or (443 if parsed.scheme == "wss" else 80)
    raw = socket.create_connection((parsed.hostname or "localhost", port), timeout=timeout)
    sock: socket.socket = ssl.create_default_context().wrap_socket(raw, server_hostname=parsed.hostname) if parsed.scheme == "wss" else raw
    sock.settimeout(timeout)
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    header_lines = [
        f"GET {path} HTTP/1.1",
        f"Host: {parsed.hostname}:{port}",
        "Upgrade: websocket",
        "Connection: Upgrade",
        f"Sec-WebSocket-Key: {key}",
        "Sec-WebSocket-Version: 13",
        *(f"{name}: {value}" for name, value in headers.items()),
        "\r\n",
    ]
    sock.sendall("\r\n".join(header_lines).encode("ascii"))
    response = sock.recv(4096).decode("latin1")
    accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii"), usedforsecurity=False).digest()).decode("ascii")
    if " 101 " not in response or accept not in response:
        raise ConnectionError(f"WebSocket upgrade failed: {response.splitlines()[:1]}")
    return sock


def _ws_send_text(sock: socket.socket, text: str) -> None:
    payload = text.encode("utf-8")
    header = bytearray([0x81])
    if len(payload) < 126:
        header.append(0x80 | len(payload))
    elif len(payload) < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", len(payload)))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", len(payload)))
    mask = os.urandom(4)
    masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    sock.sendall(bytes(header) + mask + masked)


def _ws_recv_text(sock: socket.socket) -> str:
    first = sock.recv(2)
    if len(first) < 2:
        raise EOFError("short WebSocket frame")
    opcode = first[0] & 0x0F
    length = first[1] & 0x7F
    masked = bool(first[1] & 0x80)
    if length == 126:
        length = struct.unpack("!H", _recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _recv_exact(sock, 8))[0]
    mask = _recv_exact(sock, 4) if masked else b""
    payload = _recv_exact(sock, length)
    if masked:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    if opcode == 0x8:
        raise EOFError("WebSocket closed")
    if opcode != 0x1:
        raise ValueError(f"expected text frame, got opcode {opcode}")
    return payload.decode("utf-8")


def _recv_exact(sock: socket.socket, length: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < length:
        chunk = sock.recv(length - len(chunks))
        if not chunk:
            raise EOFError("socket closed")
        chunks.extend(chunk)
    return bytes(chunks)


def _require_url_scheme(url: str, allowed: set[str]) -> None:
    scheme = urlparse(url).scheme
    if scheme not in allowed:
        raise ValueError(f"unsupported URL scheme: {scheme}")
