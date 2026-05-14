from pathlib import Path

from otel_eval_bridge.cli import main


def test_extract_and_manifest(tmp_path: Path):
    cases = tmp_path / "cases.jsonl"
    manifest = tmp_path / "manifest.json"
    assert main(["extract", "examples/genai_trace.json", "--out", str(cases)]) == 0
    assert "trace-1" in cases.read_text(encoding="utf-8")
    assert "test@example.com" not in cases.read_text(encoding="utf-8")
    assert main(["manifest", str(cases), "--out", str(manifest)]) == 0
    assert "eval-run-manifest" in manifest.read_text(encoding="utf-8")

