"""Interop of the newline-delimited MCP stdio transport with the official ``mcp`` Python SDK.

Pinned SDK: ``mcp==1.22.0``. Install it to run these tests, for example
``python3 -m venv /tmp/mcp-venv && /tmp/mcp-venv/bin/pip install mcp==1.22.0 pytest``
then ``PYTHONPATH=src /tmp/mcp-venv/bin/python -m pytest -q tests/test_mcp_sdk_interop.py``.
Without the SDK the module is skipped with that reason.

Both directions are covered:
  - Agent Studio's ``StdioTransport`` drives a real SDK (FastMCP) server subprocess.
  - The SDK's stdio client drives Agent Studio's fixture server subprocess.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

MCP_SDK_PIN = "1.22.0"

try:
    import importlib.metadata as _metadata

    import anyio
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    _SDK_VERSION = _metadata.version("mcp")
except ImportError as error:  # pragma: no cover - depends on the environment
    pytest.skip(f"official mcp SDK not importable ({error}); pip install mcp=={MCP_SDK_PIN}", allow_module_level=True)

from agentstudio.mcp import StdioTransport, discover_manifest

FIXTURES = Path(__file__).resolve().parent / "fixtures"
SDK_SERVER = FIXTURES / "mcp_sdk_server.py"
FIXTURE_SERVER = FIXTURES / "mcp_stdio_server.py"
UTF8_TEXT = "naïve café, 東京, emoji 🤖, quote \" and newline \n inside"


def test_sdk_version_is_pinned():
    assert _SDK_VERSION == MCP_SDK_PIN


# -- Agent Studio client -> real SDK server ----------------------------------

@pytest.fixture
def sdk_transport():
    transport = StdioTransport(sys.executable, [str(SDK_SERVER)])
    yield transport
    transport.close()


def test_client_initializes_lists_and_calls_sdk_server(sdk_transport):
    manifest = discover_manifest(sdk_transport, "stdio")
    assert manifest.initialize["serverInfo"]["name"] == "sdk-fixture"
    # Agent Studio offers 2025-11-25; the SDK answers with a version it supports.
    assert manifest.initialize["protocolVersion"] in {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}
    assert sorted(tool["name"] for tool in manifest.tools) == ["boom", "echo"]

    # The echo tool logs (a notifications/message line) before its response.
    result = sdk_transport.request("tools/call", {"name": "echo", "arguments": {"text": UTF8_TEXT}})
    assert result["isError"] is False
    assert result["content"][0]["text"] == UTF8_TEXT


def test_client_ids_stay_matched_across_many_requests(sdk_transport):
    discover_manifest(sdk_transport, "stdio")
    for index in range(25):
        text = f"call-{index}"
        result = sdk_transport.request("tools/call", {"name": "echo", "arguments": {"text": text}})
        assert result["content"][0]["text"] == text


def test_client_surfaces_tool_and_protocol_errors(sdk_transport):
    discover_manifest(sdk_transport, "stdio")
    failed = sdk_transport.request("tools/call", {"name": "boom", "arguments": {}})
    assert failed["isError"] is True
    assert "boom" in failed["content"][0]["text"]
    with pytest.raises(RuntimeError, match="MCP no/such/method failed"):
        sdk_transport.request("no/such/method", {})
    # The session is still usable after an error.
    assert sdk_transport.request("ping") == {}


def test_client_raises_eof_when_sdk_server_exits(sdk_transport):
    discover_manifest(sdk_transport, "stdio")
    sdk_transport._proc.stdin.close()  # the SDK server exits on stdin EOF
    sdk_transport._proc.wait(timeout=10)
    with pytest.raises((EOFError, BrokenPipeError, OSError, ValueError)):
        sdk_transport.request("tools/list")


def _raw_session(server: Path, messages: list[dict], expect_ids: set[int]) -> list[str]:
    """Send messages to a server subprocess and return raw stdout lines until every expected id answered."""
    proc = subprocess.Popen(  # nosec B603 - fixed argv, test-only
        [sys.executable, str(server)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    lines: list[str] = []
    try:
        for message in messages:
            proc.stdin.write((json.dumps(message, ensure_ascii=False) + "\n").encode("utf-8"))
            proc.stdin.flush()
        seen: set[int] = set()
        while seen != expect_ids:
            raw = proc.stdout.readline()
            assert raw, f"server closed stdout; answered {sorted(seen)}"
            assert raw.endswith(b"\n")
            line = raw.decode("utf-8").rstrip("\n")
            lines.append(line)
            message = json.loads(line)
            if "id" in message:
                seen.add(message["id"])
        proc.stdin.close()
        assert proc.wait(timeout=10) == 0  # clean exit on stdin EOF
        assert proc.stdout.read() == b""  # nothing after the last response
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    return lines


def _init_messages() -> list[dict]:
    return [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "echo", "arguments": {"text": UTF8_TEXT}}},
    ]


def test_sdk_server_stdout_is_protocol_only_and_newline_delimited():
    lines = _raw_session(SDK_SERVER, _init_messages(), {1, 2})
    assert lines, "no stdout"
    for line in lines:
        message = json.loads(line)  # every stdout line is one JSON-RPC message
        assert message["jsonrpc"] == "2.0"
    responses = {json.loads(line)["id"]: json.loads(line) for line in lines if "id" in json.loads(line)}
    assert set(responses) == {1, 2}
    assert responses[2]["result"]["content"][0]["text"] == UTF8_TEXT


def test_fixture_server_stdout_is_protocol_only_and_newline_delimited():
    messages = _init_messages()
    messages[2]["params"]["name"] = "lookup_order"
    messages[2]["params"]["arguments"] = {"order_id": UTF8_TEXT}
    lines = _raw_session(FIXTURE_SERVER, messages, {1, 2})
    parsed = [json.loads(line) for line in lines]
    assert all(message["jsonrpc"] == "2.0" for message in parsed)
    responses = {message["id"]: message for message in parsed if "id" in message}
    assert set(responses) == {1, 2}
    assert json.loads(responses[2]["result"]["content"][0]["text"]) == {"order_id": UTF8_TEXT}


# -- real SDK client -> Agent Studio fixture server ----------------------------

def test_sdk_client_drives_fixture_server():
    async def scenario() -> None:
        params = StdioServerParameters(command=sys.executable, args=[str(FIXTURE_SERVER)])
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                init = await session.initialize()
                assert init.serverInfo.name == "fixture"
                tools = await session.list_tools()
                assert [tool.name for tool in tools.tools] == ["lookup_order"]
                called = await session.call_tool("lookup_order", {"order_id": UTF8_TEXT})
                assert called.isError is False
                assert json.loads(called.content[0].text) == {"order_id": UTF8_TEXT}
                unknown = await session.call_tool("missing_tool", {})
                assert unknown.isError is True
                await session.send_ping()

    anyio.run(scenario)


def test_client_handles_partial_line_reads():
    """A response split across writes is reassembled by the line reader."""
    transport = StdioTransport(sys.executable, [str(FIXTURE_SERVER)], env={"FIXTURE_MODE": "split"})
    try:
        manifest = discover_manifest(transport, "stdio")
    finally:
        transport.close()
    assert manifest.tools[0]["name"] == "lookup_order"
