import json
import os
import subprocess
import sys
from pathlib import Path

from agent_trace_card.generator import generate_card
from agent_trace_card.importers import load_trace
from agent_trace_card.render import render_card
from agent_trace_card.schema import validate_card

ROOT = Path(__file__).resolve().parents[1]


def test_generate_refund_card():
    card = generate_card(load_trace(ROOT / "examples/refund_trace.json"))
    assert card["trace_id"] == "refund-failure-001"
    assert card["outcome"] == "failed"
    assert card["retry_count"] == 1
    assert "duplicate_mutating_tool_call" in card["failure_modes"]
    assert validate_card(card) == []


def test_validate_example_card():
    card = json.loads((ROOT / "examples/refund_agent_card.json").read_text())
    assert validate_card(card) == []


def test_success_and_human_intervention_examples_validate():
    success = generate_card(load_trace(ROOT / "examples/success_trace.json"))
    human = generate_card(load_trace(ROOT / "examples/human_intervened_trace.json"))
    assert success["outcome"] == "passed"
    assert success["human_intervention"] == "none recorded"
    assert human["outcome"] == "passed"
    assert "support lead reviewed" in human["human_intervention"]
    assert validate_card(success) == []
    assert validate_card(human) == []


def test_render_markdown_html_json():
    card = generate_card(load_trace(ROOT / "examples/refund_trace.json"))
    assert "# Agent Trace Card" in render_card(card, "markdown")
    assert "<article>" in render_card(card, "html")
    assert json.loads(render_card(card, "json"))["trace_id"] == "refund-failure-001"


def test_cli_generate_and_validate(tmp_path):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    md = tmp_path / "card.md"
    js = tmp_path / "card.json"
    gen_md = subprocess.run(
        [sys.executable, "-m", "agent_trace_card.cli", "generate", "--from", str(ROOT / "examples/refund_trace.json"), "--out", str(md)],
        text=True,
        capture_output=True,
        env=env,
    )
    assert gen_md.returncode == 0, gen_md.stderr + gen_md.stdout
    assert "duplicate_mutating_tool_call" in md.read_text()
    gen_json = subprocess.run(
        [sys.executable, "-m", "agent_trace_card.cli", "generate", "--from", str(ROOT / "examples/refund_trace.json"), "--out", str(js), "--format", "json"],
        text=True,
        capture_output=True,
        env=env,
    )
    assert gen_json.returncode == 0, gen_json.stderr + gen_json.stdout
    val = subprocess.run(
        [sys.executable, "-m", "agent_trace_card.cli", "validate", str(js)],
        text=True,
        capture_output=True,
        env=env,
    )
    assert val.returncode == 0, val.stderr + val.stdout
