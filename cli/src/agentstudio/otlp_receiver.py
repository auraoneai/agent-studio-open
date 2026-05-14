from __future__ import annotations

import json
import time
from concurrent import futures
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .importers import case_to_ast, load_replay_case

DEFAULT_MAX_OTLP_PAYLOAD_BYTES = 10 * 1024 * 1024
DEFAULT_OTLP_RATE_LIMIT_PER_MINUTE = 120


class OTLPHandler(BaseHTTPRequestHandler):
    store_path = Path("agentstudio-live.ast")
    once = False
    received = 0
    max_payload_bytes = DEFAULT_MAX_OTLP_PAYLOAD_BYTES
    rate_limit_per_minute = DEFAULT_OTLP_RATE_LIMIT_PER_MINUTE
    auth_token: str | None = None
    request_times: dict[str, list[float]] = {}

    def do_POST(self) -> None:
        if self.path not in {"/v1/traces", "/opentelemetry.proto.collector.trace.v1.TraceService/Export"}:
            self.send_error(404)
            return
        if not self._authorized():
            self.send_error(401, "OTLP receiver token required")
            return
        if not self._within_rate_limit():
            self.send_error(429, "OTLP receiver rate limit exceeded")
            return
        try:
            length = int(self.headers.get("content-length", ""))
        except ValueError:
            self.send_error(400, "invalid content-length")
            return
        if length <= 0:
            self.send_error(411, "content-length required")
            return
        if length > self.max_payload_bytes:
            self.send_error(413, "OTLP payload too large")
            return
        body = self.rfile.read(length)
        content_type = self.headers.get("content-type", "")
        if "json" in content_type:
            suffix = ".json"
            fmt = "otlp-json"
        elif "proto" in content_type or "grpc" in content_type or "octet-stream" in content_type:
            suffix = ".bin"
            fmt = "otlp-proto"
        else:
            self.send_error(415, "unsupported OTLP content-type")
            return
        tmp = self.store_path.with_suffix(suffix)
        try:
            tmp.write_bytes(body)
            case = load_replay_case(tmp, fmt)
            session_id = case_to_ast(case, self.store_path, fmt)
        except Exception:
            self.send_error(400, "invalid OTLP payload")
            return
        finally:
            tmp.unlink(missing_ok=True)
        type(self).received += 1
        self._json({"partialSuccess": {}, "session_id": session_id})
        if self.once:
            raise KeyboardInterrupt

    def log_message(self, format: str, *args: Any) -> None:
        return None

    def _json(self, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self) -> bool:
        token = type(self).auth_token
        if not token:
            return True
        return (
            self.headers.get("authorization") == f"Bearer {token}"
            or self.headers.get("x-agentstudio-otlp-token") == token
        )

    def _within_rate_limit(self) -> bool:
        limit = type(self).rate_limit_per_minute
        if limit <= 0:
            return True
        client = self.client_address[0]
        now = time.monotonic()
        window_start = now - 60
        times = [
            seen
            for seen in type(self).request_times.get(client, [])
            if seen >= window_start
        ]
        if len(times) >= limit:
            type(self).request_times[client] = times
            return False
        times.append(now)
        type(self).request_times[client] = times
        return True


def serve_otlp(
    store: str | Path,
    host: str = "127.0.0.1",
    port: int = 4318,
    once: bool = False,
    max_payload_bytes: int = DEFAULT_MAX_OTLP_PAYLOAD_BYTES,
    auth_token: str | None = None,
    rate_limit_per_minute: int = DEFAULT_OTLP_RATE_LIMIT_PER_MINUTE,
) -> None:
    OTLPHandler.store_path = Path(store)
    OTLPHandler.once = once
    OTLPHandler.max_payload_bytes = max_payload_bytes
    OTLPHandler.auth_token = auth_token
    OTLPHandler.rate_limit_per_minute = rate_limit_per_minute
    OTLPHandler.request_times = {}
    ThreadingHTTPServer((host, port), OTLPHandler).serve_forever()


class _TraceServiceHandler:
    def __init__(
        self,
        store: str | Path,
        max_payload_bytes: int,
        auth_token: str | None = None,
    ) -> None:
        self.store = Path(store)
        self.max_payload_bytes = max_payload_bytes
        self.auth_token = auth_token

    def export(self, request: bytes, context: Any) -> bytes:
        if self.auth_token:
            metadata = dict(context.invocation_metadata())
            if (
                metadata.get("authorization") != f"Bearer {self.auth_token}"
                and metadata.get("x-agentstudio-otlp-token") != self.auth_token
            ):
                context.abort(
                    _grpc_status_code("UNAUTHENTICATED"),
                    "OTLP receiver token required",
                )
        if len(request) > self.max_payload_bytes:
            context.abort(_grpc_status_code("RESOURCE_EXHAUSTED"), "OTLP payload too large")
        tmp = self.store.with_suffix(".grpc.pb")
        try:
            tmp.write_bytes(request)
            case = load_replay_case(tmp, "otlp-proto")
            case_to_ast(case, self.store, "otlp-grpc")
        finally:
            tmp.unlink(missing_ok=True)
        return b""


class _GenericOTLPService:
    method = "/opentelemetry.proto.collector.trace.v1.TraceService/Export"

    def __init__(self, handler: _TraceServiceHandler) -> None:
        self.handler = handler

    def service(self, handler_call_details: Any) -> Any:
        if handler_call_details.method != self.method:
            return None
        import grpc

        return grpc.unary_unary_rpc_method_handler(
            self.handler.export,
            request_deserializer=lambda payload: payload,
            response_serializer=lambda payload: payload,
        )


def start_otlp_grpc(
    store: str | Path,
    host: str = "127.0.0.1",
    port: int = 4317,
    max_payload_bytes: int = DEFAULT_MAX_OTLP_PAYLOAD_BYTES,
    auth_token: str | None = None,
):
    import grpc

    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=2),
        options=[
            ("grpc.max_receive_message_length", max_payload_bytes),
            ("grpc.max_send_message_length", max_payload_bytes),
        ],
    )
    server.add_generic_rpc_handlers(
        (_GenericOTLPService(_TraceServiceHandler(store, max_payload_bytes, auth_token)),)
    )
    bound = server.add_insecure_port(f"{host}:{port}")
    if bound == 0:
        raise OSError(f"could not bind OTLP gRPC receiver on {host}:{port}")
    server.start()
    return server


def serve_otlp_grpc(
    store: str | Path,
    host: str = "127.0.0.1",
    port: int = 4317,
    max_payload_bytes: int = DEFAULT_MAX_OTLP_PAYLOAD_BYTES,
    auth_token: str | None = None,
) -> None:
    server = start_otlp_grpc(store, host, port, max_payload_bytes, auth_token)
    server.wait_for_termination()


def _grpc_status_code(name: str) -> Any:
    import grpc

    return getattr(grpc.StatusCode, name)
