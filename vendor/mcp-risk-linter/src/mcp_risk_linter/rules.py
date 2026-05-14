from __future__ import annotations

from dataclasses import dataclass


SEVERITY_ORDER = {
    "none": 99,
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    severity: str
    description: str
    remediation: str


RULES: dict[str, Rule] = {
    "MCP001": Rule(
        "MCP001",
        "shell-execution",
        "high",
        "Tool implementation appears to execute shell commands or child processes.",
        "Document the need for process execution, validate arguments, avoid shell=True, and scope exposed commands.",
    ),
    "MCP002": Rule(
        "MCP002",
        "broad-filesystem-access",
        "high",
        "Tool implementation appears to read or write broad filesystem locations.",
        "Restrict access to explicit allowlisted directories and document filesystem scope.",
    ),
    "MCP003": Rule(
        "MCP003",
        "broad-network-access",
        "medium",
        "Tool implementation appears to make outbound network calls.",
        "Document allowed hosts, authentication, timeouts, and side effects for network calls.",
    ),
    "MCP004": Rule(
        "MCP004",
        "secret-exposure",
        "high",
        "Tool implementation appears to read or log secret-like environment values.",
        "Avoid logging secrets, redact sensitive fields, and document credential handling.",
    ),
    "MCP005": Rule(
        "MCP005",
        "vague-tool-description",
        "medium",
        "Tool description is too vague for an installer to understand risk.",
        "Describe what data the tool can read or mutate and what side effects it can cause.",
    ),
    "MCP006": Rule(
        "MCP006",
        "mutating-tool-without-side-effect-language",
        "medium",
        "Mutating tool description does not clearly explain side effects.",
        "Add clear side-effect language such as creates, updates, deletes, writes, sends, or modifies.",
    ),
    "MCP007": Rule(
        "MCP007",
        "missing-security-docs",
        "low",
        "Repository does not include a SECURITY.md file or equivalent security section.",
        "Add SECURITY.md with reporting instructions, supported versions, and scope disclaimers.",
    ),
    "MCP008": Rule(
        "MCP008",
        "missing-auth-boundary-docs",
        "medium",
        "Repository does not document authentication, authorization, or permission boundaries.",
        "Document required credentials, accessible data, permission scopes, and installer trust boundaries.",
    ),
}


def severity_at_least(value: str, threshold: str) -> bool:
    if threshold == "none":
        return False
    return SEVERITY_ORDER[value] >= SEVERITY_ORDER[threshold]
