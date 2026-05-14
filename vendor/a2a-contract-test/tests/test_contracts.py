from a2a_contract_test.agent_card import load_json, validate_agent_card
from a2a_contract_test.assertions import validate_transcript
from a2a_contract_test.client import load_transcript


def test_passing_contract_has_no_findings():
    card = load_json("examples/passing_agent/agent-card.json")
    transcript = load_transcript("examples/passing_agent/agent-card.json")
    assert validate_agent_card(card) + validate_transcript(card, transcript) == []


def test_failing_contract_has_at_least_five_findings():
    card = load_json("examples/failing_agent/agent-card.json")
    transcript = load_transcript("examples/failing_agent/agent-card.json")
    findings = validate_agent_card(card) + validate_transcript(card, transcript)
    assert len(findings) >= 5
    assert any(item["category"] == "lifecycle" for item in findings)
    assert any(item["category"] == "negotiation" for item in findings)

