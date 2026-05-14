from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .parsers import ToolDefinition, extract_tools_from_json, extract_tools_from_text, load_json
from .rules import RULES, severity_at_least


SOURCE_SUFFIXES = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
DOC_SUFFIXES = {".md", ".mdx", ".rst", ".txt"}
JSON_SUFFIXES = {".json"}
SKIP_DIRS = {".git", ".hg", ".svn", ".venv", "venv", "node_modules", "dist", "build", "__pycache__", ".pytest_cache"}

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("MCP001", re.compile(r"\b(subprocess\.(run|Popen|call)|os\.system|exec\(|eval\(|child_process\.(exec|spawn|execFile)|shell\s*:\s*true)\b")),
    ("MCP002", re.compile(r"(\bopen\s*\(|Path\s*\(|fs\.(readFile|writeFile|readdir|rm|unlink)|readFileSync|writeFileSync|HOME|~\/|\/etc\/|\/var\/|\/tmp\/|\.\.\/)")),
    ("MCP003", re.compile(r"\b(requests\.(get|post|put|delete)|httpx\.|urllib\.request|fetch\s*\(|axios\.|socket\.|net\.connect)")),
    ("MCP004", re.compile(r"(os\.environ|process\.env|API_KEY|TOKEN|SECRET|PASSWORD|Authorization|console\.log\s*\([^)]*env|print\s*\([^)]*environ)", re.I)),
]

AUTH_WORDS = re.compile(r"\b(auth|oauth|token|permission|scope|credential|secret|authorization|access boundary|least privilege)\b", re.I)
SIDE_EFFECT_WORDS = re.compile(r"\b(create|update|delete|remove|write|send|modify|edit|commit|push|upload|purchase|side effect)\b", re.I)
VAGUE_DESCRIPTION = re.compile(r"^\s*(tool|utility|helper|does things|runs command|access data|manage files)\s*\.?\s*$", re.I)
SUPPRESSION = re.compile(r"mcp-risk-linter:\s*ignore\s+([A-Z0-9_, -]+)\s+--\s*(.{8,})", re.I)


@dataclass(frozen=True)
class Finding:
    rule_id: str
    severity: str
    message: str
    path: str
    line: int = 1
    snippet: str = ""
    remediation: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "rule_id": self.rule_id,
            "severity": self.severity,
            "message": self.message,
            "path": self.path,
            "line": self.line,
            "snippet": self.snippet,
            "remediation": self.remediation,
        }


@dataclass
class ScanReport:
    root: str
    findings: list[Finding] = field(default_factory=list)
    tools: list[ToolDefinition] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.findings

    def failing_findings(self, threshold: str) -> list[Finding]:
        return [finding for finding in self.findings if severity_at_least(finding.severity, threshold)]

    def to_dict(self) -> dict[str, object]:
        counts: dict[str, int] = {}
        for finding in self.findings:
            counts[finding.severity] = counts.get(finding.severity, 0) + 1
        return {
            "root": self.root,
            "finding_count": len(self.findings),
            "counts": counts,
            "tools": [{"name": tool.name, "description": tool.description, "source": tool.source} for tool in self.tools],
            "findings": [finding.to_dict() for finding in self.findings],
        }


def scan_path(root: str | Path) -> ScanReport:
    root_path = Path(root).resolve()
    report = ScanReport(root=str(root_path))
    files = list(_iter_files(root_path))

    docs_text = ""
    has_security_doc = False

    for path in files:
        rel = path.relative_to(root_path).as_posix()
        if path.name.upper() == "SECURITY.MD":
            has_security_doc = True
        if path.suffix.lower() in DOC_SUFFIXES:
            docs_text += "\n" + _read_text(path)
        if path.suffix.lower() in JSON_SUFFIXES:
            payload = load_json(path)
            if payload is not None:
                report.tools.extend(extract_tools_from_json(payload, rel))
        if path.suffix.lower() in SOURCE_SUFFIXES:
            text = _read_text(path)
            report.tools.extend(extract_tools_from_text(text, rel))
            report.findings.extend(_scan_source_text(text, rel))

    report.findings.extend(_scan_tools(report.tools))

    if not has_security_doc and not re.search(r"security", docs_text, re.I):
        report.findings.append(_finding("MCP007", "Repository does not include SECURITY.md or a clear security section.", "SECURITY.md", 1, "missing"))

    if not AUTH_WORDS.search(docs_text):
        report.findings.append(_finding("MCP008", "Repository does not document authentication, authorization, credentials, or permission boundaries.", "README.md", 1, "missing"))

    return report


def _iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        parts = set(path.relative_to(root).parts)
        if parts & SKIP_DIRS:
            continue
        yield path


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf8")
    except UnicodeDecodeError:
        return ""


def _scan_source_text(text: str, rel: str) -> list[Finding]:
    findings: list[Finding] = []
    lines = text.splitlines()
    for rule_id, pattern in PATTERNS:
        for index, line in enumerate(lines, start=1):
            if pattern.search(line):
                if _suppressed(lines, index, rule_id):
                    continue
                rule = RULES[rule_id]
                findings.append(_finding(rule_id, rule.description, rel, index, line.strip()[:200]))
    return findings


def _suppressed(lines: list[str], index: int, rule_id: str) -> bool:
    candidates = []
    if index > 1:
        candidates.append(lines[index - 2])
    candidates.append(lines[index - 1])
    for candidate in candidates:
        match = SUPPRESSION.search(candidate)
        if not match:
            continue
        rules = {part.strip().upper() for part in re.split(r"[, ]+", match.group(1)) if part.strip()}
        if rule_id in rules or "ALL" in rules:
            return True
    return False


def _scan_tools(tools: list[ToolDefinition]) -> list[Finding]:
    findings: list[Finding] = []
    for tool in tools:
        description = tool.description.strip()
        if len(description) < 20 or VAGUE_DESCRIPTION.search(description):
            findings.append(
                _finding(
                    "MCP005",
                    f"Tool `{tool.name}` has a vague or too-short description.",
                    tool.source,
                    1,
                    description,
                )
            )
        if tool.mutating_hint and not SIDE_EFFECT_WORDS.search(description):
            findings.append(
                _finding(
                    "MCP006",
                    f"Tool `{tool.name}` may mutate state but does not clearly describe side effects.",
                    tool.source,
                    1,
                    description,
                )
            )
    return findings


def _finding(rule_id: str, message: str, path: str, line: int, snippet: str) -> Finding:
    rule = RULES[rule_id]
    return Finding(
        rule_id=rule.id,
        severity=rule.severity,
        message=message,
        path=path,
        line=line,
        snippet=snippet,
        remediation=rule.remediation,
    )
