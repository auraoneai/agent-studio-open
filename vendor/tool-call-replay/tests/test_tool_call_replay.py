import json
import os
import subprocess
import sys
from pathlib import Path

from tool_call_replay.assertions import load_assertions
from tool_call_replay.ingest import ingest_jsonl, ingest_otlp
from tool_call_replay.pytest_gen import generate_pytest
from tool_call_replay.replay import run_assertions, save_replay

ROOT = Path(__file__).resolve().parents[1]


def test_jsonl_ingest_redacts_secrets():
    case = ingest_jsonl(ROOT / "examples/failed_refund_agent_trace.jsonl")
    assert case.trace_id == "refund-failure-001"
    first_call = next(event for event in case.events if event.event_type == "tool_call")
    assert first_call.arguments["api_key"] == "[REDACTED]"


def test_failed_trace_assertions_fail():
    case = ingest_jsonl(ROOT / "examples/failed_refund_agent_trace.jsonl")
    assertions = load_assertions(ROOT / "examples/refund_assertions.yaml")
    results = run_assertions(case, assertions)
    assert not all(result.ok for result in results)
    assert any(result.name == "tool_order" and not result.ok for result in results)


def test_recovered_trace_assertions_pass():
    case = ingest_jsonl(ROOT / "examples/recovered_trace.jsonl")
    assertions = load_assertions(ROOT / "examples/refund_assertions.yaml")
    results = run_assertions(case, assertions)
    assert all(result.ok for result in results), results


def test_otlp_ingest():
    case = ingest_otlp(ROOT / "examples/otlp_trace.json")
    assert [event.tool_name for event in case.events if event.event_type == "tool_call"] == ["lookup_order", "issue_refund"]


def test_pytest_generation_is_executable():
    case = ingest_jsonl(ROOT / "examples/recovered_trace.jsonl")
    assertions = load_assertions(ROOT / "examples/refund_assertions.yaml")
    generated = generate_pytest(case, assertions)
    assert "test_tool_call_replay_regression" in generated
    compile(generated, "generated_test.py", "exec")


def test_cli_ingest_run_and_pytest(tmp_path):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    replay = tmp_path / "replay.json"
    report = tmp_path / "report.md"
    generated = tmp_path / "test_generated.py"
    ingest = subprocess.run(
        [sys.executable, "-m", "tool_call_replay.cli", "ingest", str(ROOT / "examples/recovered_trace.jsonl"), "--out", str(replay)],
        text=True,
        capture_output=True,
        env=env,
    )
    assert ingest.returncode == 0, ingest.stderr + ingest.stdout
    run = subprocess.run(
        [sys.executable, "-m", "tool_call_replay.cli", "run", str(replay), "--assert", str(ROOT / "examples/refund_assertions.yaml"), "--report", str(report)],
        text=True,
        capture_output=True,
        env=env,
    )
    assert run.returncode == 0, run.stderr + run.stdout
    assert "Tool Call Replay Report" in report.read_text()
    gen = subprocess.run(
        [sys.executable, "-m", "tool_call_replay.cli", "pytest", str(replay), "--assert", str(ROOT / "examples/refund_assertions.yaml"), "--out", str(generated)],
        text=True,
        capture_output=True,
        env=env,
    )
    assert gen.returncode == 0, gen.stderr + gen.stdout
    subprocess.run([sys.executable, str(generated)], check=True, env=env)


def test_cli_failing_trace_exits_nonzero(tmp_path):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    replay = tmp_path / "replay.json"
    save_replay(ingest_jsonl(ROOT / "examples/failed_refund_agent_trace.jsonl"), replay)
    proc = subprocess.run(
        [sys.executable, "-m", "tool_call_replay.cli", "run", str(replay), "--assert", str(ROOT / "examples/refund_assertions.yaml")],
        text=True,
        capture_output=True,
        env=env,
    )
    assert proc.returncode == 1
    assert "tool_order" in proc.stdout
