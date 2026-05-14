from __future__ import annotations

import argparse
import json
import subprocess  # nosec B404
import sys
from pathlib import Path

from a2a_contract_test.agent_card import validate_agent_card
from a2a_contract_test.assertions import validate_transcript
from a2a_contract_test.report import build_result, render_json, render_markdown
from mcp_risk_linter.report import render_report
from mcp_risk_linter.scanner import scan_path
from tool_call_replay.assertions import load_assertions
from tool_call_replay.replay import load_replay, run_assertions, save_replay

from .exports import diff_trace_stores, export_github_action, export_intake, export_junit, export_phoenix_json, export_pr_comment, write_diff_markdown
from .importers import case_to_ast, load_a2a_card, load_replay_case
from .mcp import HTTPTransport, RemoteAuthConfig, SSETransport, StdioTransport, WebSocketTransport, discover_manifest
from .models import ModelGateway
from .otlp_receiver import (
    DEFAULT_MAX_OTLP_PAYLOAD_BYTES,
    DEFAULT_OTLP_RATE_LIMIT_PER_MINUTE,
    serve_otlp,
    serve_otlp_grpc,
)
from .sidecar import bootstrap_venv, health, serve
from .trace_store import TraceStore


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agentstudio")
    parser.add_argument("--json", action="store_true", help="emit JSON where supported")
    sub = parser.add_subparsers(dest="command", required=True)

    connect = sub.add_parser("connect", help="connect to MCP servers")
    connect_sub = connect.add_subparsers(dest="transport", required=True)
    stdio = connect_sub.add_parser("stdio")
    stdio.add_argument("--command", dest="executable", required=True)
    stdio.add_argument("--arg", action="append", default=[])
    stdio.add_argument("--cwd")
    http = connect_sub.add_parser("http")
    http.add_argument("url")
    _add_remote_auth_args(http)
    sse = connect_sub.add_parser("sse")
    sse.add_argument("url")
    sse.add_argument("--post-url")
    _add_remote_auth_args(sse)
    ws = connect_sub.add_parser("ws")
    ws.add_argument("url")

    a2a = sub.add_parser("a2a", help="run A2A contract checks")
    a2a.add_argument("agent_card")
    a2a.add_argument("--transcript")
    a2a.add_argument("--format", choices=["json", "markdown"], default="json")
    a2a.add_argument("--out")

    risk = sub.add_parser("risk-scan")
    risk.add_argument("path")
    risk.add_argument("--format", choices=["json", "markdown", "sarif"], default="json")
    risk.add_argument("--out")
    risk.add_argument("--fail-on", choices=["low", "medium", "high", "critical"], default="high")

    record = sub.add_parser("record")
    record.add_argument("session_name")
    record.add_argument("--store", required=True)
    record.add_argument("argv", nargs=argparse.REMAINDER)

    import_trace = sub.add_parser("import-trace")
    import_trace.add_argument("trace")
    import_trace.add_argument("--format", choices=["jsonl", "openai", "otlp-json", "otlp-proto", "phoenix", "replay"], required=True)
    import_trace.add_argument("--store", required=True)

    store = sub.add_parser("store")
    store_sub = store.add_subparsers(dest="store_command", required=True)
    search = store_sub.add_parser("search")
    search.add_argument("store")
    search.add_argument("query")
    dump = store_sub.add_parser("dump-replay")
    dump.add_argument("store")
    dump.add_argument("--session-id")
    dump.add_argument("--out", required=True)

    replay = sub.add_parser("replay")
    replay.add_argument("replay")
    replay.add_argument("--assert", dest="assertions", required=True)
    replay.add_argument("--report")

    compare = sub.add_parser("compare")
    compare.add_argument("--baseline", required=True)
    compare.add_argument("--candidate", required=True)
    compare.add_argument("--out")

    export = sub.add_parser("export")
    export_sub = export.add_subparsers(dest="export_command", required=True)
    gh = export_sub.add_parser("gh-action")
    gh.add_argument("suite")
    gh.add_argument("--out", required=True)
    junit = export_sub.add_parser("junit")
    junit.add_argument("results")
    junit.add_argument("--out", required=True)
    pr = export_sub.add_parser("pr-comment")
    pr.add_argument("store")
    pr.add_argument("--out", required=True)
    intake = export_sub.add_parser("intake")
    intake.add_argument("store")
    intake.add_argument("--out", required=True)
    intake.add_argument("--risk-report")
    intake.add_argument("--suite")
    card = export_sub.add_parser("trace-card")
    card.add_argument("trace")
    card.add_argument("--out", required=True)
    card.add_argument("--format", choices=["markdown", "json", "html"], default="markdown")
    phoenix = export_sub.add_parser("phoenix-json")
    phoenix.add_argument("store")
    phoenix.add_argument("--out", required=True)
    phoenix.add_argument("--session-id")

    bridge = sub.add_parser("otel-bridge")
    bridge_sub = bridge.add_subparsers(dest="bridge_command", required=True)
    extract = bridge_sub.add_parser("extract")
    extract.add_argument("trace")
    extract.add_argument("--out", required=True)
    extract.add_argument("--no-redact", action="store_true")

    sidecar = sub.add_parser("sidecar")
    sidecar_sub = sidecar.add_subparsers(dest="sidecar_command", required=True)
    bootstrap = sidecar_sub.add_parser("bootstrap")
    bootstrap.add_argument("--venv", required=True)
    bootstrap.add_argument("--requirements")
    sidecar_sub.add_parser("health")
    serve_cmd = sidecar_sub.add_parser("serve")
    serve_cmd.add_argument("--host", default="127.0.0.1")
    serve_cmd.add_argument("--port", type=int, default=8765)

    otlp = sub.add_parser("otlp")
    otlp_sub = otlp.add_subparsers(dest="otlp_command", required=True)
    recv = otlp_sub.add_parser("receive")
    recv.add_argument("--store", required=True)
    recv.add_argument("--host", default="127.0.0.1")
    recv.add_argument("--port", type=int, default=4318)
    recv.add_argument("--once", action="store_true")
    recv.add_argument("--grpc", action="store_true", help="serve the OTLP gRPC TraceService on the selected port")
    recv.add_argument("--max-payload-bytes", type=int, default=DEFAULT_MAX_OTLP_PAYLOAD_BYTES)
    recv.add_argument("--auth-token", help="optional bearer token required for OTLP receiver writes")
    recv.add_argument("--rate-limit-per-minute", type=int, default=DEFAULT_OTLP_RATE_LIMIT_PER_MINUTE)

    model = sub.add_parser("model")
    model.add_argument("--provider", required=True)
    model.add_argument("--model", required=True)
    model.add_argument("--prompt", required=True)
    model.add_argument("--dry-run", action="store_true")
    model.add_argument("--stream", action="store_true")

    sub.add_parser("self-test")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "connect":
        transport = _transport(args)
        try:
            manifest = discover_manifest(transport, args.transport).to_dict()
        finally:
            transport.close()
        return _emit(manifest, args.json)
    if args.command == "a2a":
        card = load_a2a_card(args.agent_card)
        transcript = []
        if args.transcript:
            transcript = json.loads(Path(args.transcript).read_text(encoding="utf-8"))
        result = build_result(card, transcript, validate_agent_card(card) + validate_transcript(card, transcript))
        output = render_json(result) if args.format == "json" else render_markdown(result)
        _write_or_print(output, args.out)
        return 0 if result["passed"] else 1
    if args.command == "risk-scan":
        report = scan_path(args.path)
        output = render_report(report, args.format)
        _write_or_print(output, args.out)
        return 1 if report.failing_findings(args.fail_on) else 0
    if args.command == "record":
        if args.argv and args.argv[0] == "--":
            args.argv = args.argv[1:]
        # record intentionally wraps explicit user argv with shell=False.
        proc = subprocess.run(args.argv, text=True, capture_output=True, check=False)  # nosec B603
        store = TraceStore(args.store)
        try:
            sid = store.create_session(args.session_name, outcome="success" if proc.returncode == 0 else "failed")
            store.add_turn(sid, 0, "process", {"argv": args.argv, "stdout": proc.stdout, "stderr": proc.stderr, "returncode": proc.returncode})
        finally:
            store.close()
        return _emit({"session_id": sid, "returncode": proc.returncode}, args.json)
    if args.command == "import-trace":
        case = load_replay_case(args.trace, args.format)
        sid = case_to_ast(case, args.store, args.format)
        return _emit({"session_id": sid, "store": args.store}, args.json)
    if args.command == "store":
        return _store(args)
    if args.command == "replay":
        case = load_replay(args.replay)
        results = run_assertions(case, load_assertions(args.assertions))
        payload = [result.__dict__ for result in results]
        if args.report:
            from tool_call_replay.report import markdown_report

            Path(args.report).write_text(markdown_report(case, results), encoding="utf-8")
        else:
            _emit(payload, args.json)
        return 0 if all(result.ok for result in results) else 1
    if args.command == "compare":
        diff = diff_trace_stores(args.baseline, args.candidate)
        if args.out:
            write_diff_markdown(diff, args.out)
        else:
            _emit(diff.to_dict(), args.json)
        return 0 if diff.passed else 1
    if args.command == "export":
        return _export(args)
    if args.command == "otel-bridge":
        return _otel_bridge(args)
    if args.command == "sidecar":
        return _sidecar(args)
    if args.command == "otlp":
        if args.grpc:
            serve_otlp_grpc(
                args.store,
                args.host,
                args.port,
                args.max_payload_bytes,
                args.auth_token,
            )
        else:
            serve_otlp(
                args.store,
                args.host,
                args.port,
                args.once,
                args.max_payload_bytes,
                args.auth_token,
                args.rate_limit_per_minute,
            )
        return 0
    if args.command == "model":
        if args.stream:
            events = list(ModelGateway().stream_complete(args.provider, args.model, args.prompt, dry_run=args.dry_run))
            return _emit(events, args.json)
        return _emit(ModelGateway().complete(args.provider, args.model, args.prompt, dry_run=args.dry_run).to_dict(), args.json)
    if args.command == "self-test":
        return _emit(health(), args.json)
    return 2


def _transport(args: argparse.Namespace):
    if args.transport == "stdio":
        return StdioTransport(args.executable, args.arg, cwd=args.cwd)
    if args.transport == "http":
        return HTTPTransport(args.url, auth=_remote_auth(args))
    if args.transport == "sse":
        return SSETransport(args.url, post_url=args.post_url, auth=_remote_auth(args))
    if args.transport == "ws":
        return WebSocketTransport(args.url)
    raise ValueError(args.transport)


def _add_remote_auth_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--header", action="append", default=[], help="remote MCP header as name=value; repeatable")
    parser.add_argument("--bearer-token", help="bearer token for protected remote MCP servers")
    parser.add_argument("--oauth-access-token", help="OAuth access token for protected remote MCP servers")
    parser.add_argument("--oauth-resource-metadata-url", help="OAuth protected resource metadata URL to preflight before connecting")
    parser.add_argument("--mtls-cert", help="client certificate PEM for mTLS-protected remote MCP servers")
    parser.add_argument("--mtls-key", help="client private key PEM for mTLS-protected remote MCP servers")


def _remote_auth(args: argparse.Namespace) -> RemoteAuthConfig:
    return RemoteAuthConfig(
        headers=tuple(_parse_header(header) for header in args.header),
        bearer_token=args.bearer_token,
        oauth_access_token=args.oauth_access_token,
        oauth_resource_metadata_url=args.oauth_resource_metadata_url,
        mtls_cert=args.mtls_cert,
        mtls_key=args.mtls_key,
    )


def _parse_header(raw: str) -> tuple[str, str]:
    if "=" not in raw:
        raise ValueError("--header must use name=value syntax")
    name, value = raw.split("=", 1)
    name = name.strip()
    if not name:
        raise ValueError("--header name cannot be empty")
    return name, value.strip()


def _store(args: argparse.Namespace) -> int:
    store = TraceStore(args.store)
    try:
        if args.store_command == "search":
            return _emit([hit.to_dict() for hit in store.search(args.query)], getattr(args, "json", False))
        if args.store_command == "dump-replay":
            replay = store.session_replay(args.session_id or store.first_session_id())
            save_replay(load_replay_from_dict(replay), args.out)
            return _emit({"out": args.out}, getattr(args, "json", False))
    finally:
        store.close()
    return 2


def load_replay_from_dict(payload: dict):
    from tool_call_replay.replay import ReplayCase, ReplayEvent

    return ReplayCase(
        payload["schema_version"],
        payload["trace_id"],
        payload["goal"],
        [ReplayEvent(item["type"], item.get("tool_name"), item.get("arguments"), item.get("output"), item.get("error")) for item in payload["events"]],
        payload.get("final_answer"),
    )


def _export(args: argparse.Namespace) -> int:
    if args.export_command == "gh-action":
        return _emit({"files": export_github_action(args.suite, args.out)}, getattr(args, "json", False))
    if args.export_command == "junit":
        results = json.loads(Path(args.results).read_text(encoding="utf-8"))
        export_junit(results, args.out)
        return _emit({"out": args.out}, getattr(args, "json", False))
    if args.export_command == "pr-comment":
        export_pr_comment(args.store, args.out)
        return _emit({"out": args.out}, getattr(args, "json", False))
    if args.export_command == "intake":
        export_intake(args.store, args.out, risk_report=args.risk_report, suite=args.suite)
        return _emit({"out": args.out}, getattr(args, "json", False))
    if args.export_command == "trace-card":
        from agent_trace_card.generator import generate_card
        from agent_trace_card.importers import load_trace
        from agent_trace_card.render import render_card

        Path(args.out).write_text(render_card(generate_card(load_trace(_resolve_input_path(args.trace))), args.format), encoding="utf-8")
        return _emit({"out": args.out, "format": args.format}, getattr(args, "json", False))
    if args.export_command == "phoenix-json":
        export_phoenix_json(args.store, args.out, session_id=args.session_id)
        return _emit({"out": args.out, "format": "phoenix-json"}, getattr(args, "json", False))
    return 2


def _otel_bridge(args: argparse.Namespace) -> int:
    if args.bridge_command == "extract":
        from otel_eval_bridge.eval_case import span_to_eval_case
        from otel_eval_bridge.otlp_reader import load_spans

        cases = [
            case
            for span in load_spans(_resolve_input_path(args.trace))
            if (case := span_to_eval_case(span, redaction=not args.no_redact))
        ]
        Path(args.out).write_text("".join(json.dumps(case, sort_keys=True) + "\n" for case in cases), encoding="utf-8")
        return _emit({"out": args.out, "case_count": len(cases)}, getattr(args, "json", False))
    return 2


def _sidecar(args: argparse.Namespace) -> int:
    if args.sidecar_command == "bootstrap":
        return _emit(bootstrap_venv(args.venv, args.requirements), getattr(args, "json", False))
    if args.sidecar_command == "health":
        payload = health()
        _emit(payload, getattr(args, "json", False))
        return 0 if payload["ok"] else 1
    if args.sidecar_command == "serve":
        serve(args.host, args.port)
        return 0
    return 2


def _write_or_print(output: str, out: str | None) -> None:
    if out:
        Path(out).write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output if output.endswith("\n") else output + "\n")


def _resolve_input_path(path: str | Path) -> Path:
    candidate = Path(path)
    if candidate.exists() or candidate.is_absolute():
        return candidate
    parts = candidate.parts
    for engine_name in (
        "mcp-risk-linter",
        "a2a-contract-test",
        "tool-call-replay",
        "agent-trace-card",
        "otel-eval-bridge",
    ):
        if engine_name in parts:
            engine_index = parts.index(engine_name)
            vendor_candidate = (
                Path(__file__).resolve().parents[3]
                / "vendor"
                / engine_name
                / Path(*parts[engine_index + 1 :])
            )
            if vendor_candidate.exists():
                return vendor_candidate
    cli_root = Path(__file__).resolve().parents[2]
    rooted = (cli_root / candidate).resolve()
    if rooted.exists():
        return rooted
    repo_root = Path(__file__).resolve().parents[5]
    repo_relative = (repo_root / candidate).resolve()
    if repo_relative.exists():
        return repo_relative
    return candidate


def _emit(payload, json_output: bool) -> int:
    if json_output:
        sys.stdout.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    else:
        if isinstance(payload, (dict, list)):
            sys.stdout.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
        else:
            sys.stdout.write(str(payload) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
