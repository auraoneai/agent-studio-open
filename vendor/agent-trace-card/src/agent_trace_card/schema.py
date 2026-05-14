from __future__ import annotations

REQUIRED = ["schema_version", "trace_id", "goal", "outcome", "tools", "failure_modes", "regression_status"]


def validate_card(card: dict) -> list[str]:
    errors: list[str] = []
    for key in REQUIRED:
        if key not in card:
            errors.append(f"missing required field `{key}`")
    if card.get("schema_version") != "agent-trace-card/v1":
        errors.append("schema_version must be `agent-trace-card/v1`")
    for key in ["tools", "data_touched", "policy_checks", "failure_modes"]:
        if key in card and not isinstance(card[key], list):
            errors.append(f"`{key}` must be a list")
    if "retry_count" in card and (not isinstance(card["retry_count"], int) or card["retry_count"] < 0):
        errors.append("`retry_count` must be a non-negative integer")
    return errors
