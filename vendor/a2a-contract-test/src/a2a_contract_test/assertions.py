from __future__ import annotations

from typing import Any

from .agent_card import finding

TERMINAL_STATES = {"completed", "failed", "cancelled"}
PROGRESS_STATES = {"working", "input_required"}
SECRET_KEYS = ("authorization", "cookie", "api_key", "apikey", "token", "secret", "password")


def validate_transcript(card: dict[str, Any], transcript: list[dict[str, Any]]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    if not transcript:
        return [finding("high", "transcript", "transcript is empty")]

    states = [entry.get("response", {}).get("state") for entry in transcript if isinstance(entry, dict)]
    if "submitted" not in states:
        findings.append(finding("high", "lifecycle", "no task creation response reached `submitted`"))
    if not any(state in PROGRESS_STATES for state in states):
        findings.append(finding("medium", "lifecycle", "no progress state found before terminal state"))
    if not any(state in TERMINAL_STATES for state in states):
        findings.append(finding("high", "lifecycle", "no terminal task state found"))

    task_ids = {
        entry.get("response", {}).get("task_id")
        for entry in transcript
        if entry.get("operation") in {"create_task", "poll_task"} and entry.get("response", {}).get("task_id")
    }
    if len(task_ids) > 1:
        findings.append(finding("high", "lifecycle", "task id changes during lifecycle"))

    if "application/json" in card.get("content_types", []):
        for entry in transcript:
            payload = entry.get("request", {}).get("payload")
            if payload is not None and not isinstance(payload, dict):
                findings.append(finding("high", "payload", "JSON request payload is not an object"))
            result = entry.get("response", {}).get("result")
            if result is not None and not isinstance(result, dict):
                findings.append(finding("high", "payload", "JSON response result is not an object"))

    declared_cancel = any(cap.get("name") == "cancel_task" for cap in card.get("capabilities", []) if isinstance(cap, dict))
    saw_cancel = any(entry.get("operation") == "cancel_task" for entry in transcript)
    if declared_cancel and not saw_cancel:
        findings.append(finding("medium", "cancellation", "`cancel_task` declared but cancellation was not exercised"))

    errors = [entry.get("response", {}).get("error") for entry in transcript if entry.get("response", {}).get("error")]
    if not any(isinstance(error, dict) and error.get("code") == "unsupported_capability" for error in errors):
        findings.append(finding("medium", "negotiation", "unsupported capability error was not demonstrated"))
    for error in errors:
        if not isinstance(error, dict) or not error.get("code") or not error.get("message"):
            findings.append(finding("high", "error", "error payload must include `code` and `message`"))

    return findings


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            if any(secret in key.lower() for secret in SECRET_KEYS):
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = redact(item)
        return redacted
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str) and ("sk-" in value or "pypi-" in value):
        return "[REDACTED]"
    return value
