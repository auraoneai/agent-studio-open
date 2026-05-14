from a2a_contract_test.agent_card import load_json, validate_agent_card


def test_passing_card_has_no_card_findings():
    card = load_json("examples/passing_agent/agent-card.json")
    assert validate_agent_card(card) == []


def test_failing_card_reports_required_contract_issues():
    card = load_json("examples/failing_agent/agent-card.json")
    findings = validate_agent_card(card)
    messages = [item["message"] for item in findings]
    assert "`endpoint` must be an HTTP(S) URL" in messages
    assert "`version` should be semantic version-like" in messages
    assert any("duplicate capability" in message for message in messages)

