from a2a_contract_test.agent_card import load_json
from a2a_contract_test.assertions import validate_transcript
from a2a_contract_test.client import load_transcript
from a2a_contract_test.report import build_result, render_markdown


def test_report_redacts_transcript_secrets():
    card = load_json("examples/passing_agent/agent-card.json")
    transcript = load_transcript("examples/passing_agent/agent-card.json")
    result = build_result(card, transcript, validate_transcript(card, transcript))
    markdown = render_markdown(result)
    assert "[REDACTED]" in markdown
    assert "sk-test" not in markdown

