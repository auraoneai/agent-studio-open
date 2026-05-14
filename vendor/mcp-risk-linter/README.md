# mcp-risk-linter

`mcp-risk-linter` is a readiness linter for Model Context Protocol server repositories. It scans manifests, package metadata, source files, and docs for risky tool surfaces before an MCP server is published, installed, or admitted into an internal agent platform.

It is designed for MCP maintainers, agent infrastructure teams, and security reviewers who need fast, local, deterministic checks.

## Quickstart

```bash
python -m venv .venv
. .venv/bin/activate
pip install mcp-risk-linter
mcp-risk-linter scan examples/risky_stdio_server --format markdown --out report.md
```

For local development:

```bash
python -m pytest -q
python -m mcp_risk_linter.cli scan examples/risky_stdio_server --format json
```

## What It Checks

- shell execution paths such as `subprocess`, `exec`, `spawn`, and `os.system`;
- broad filesystem access, including home-directory and root traversal patterns;
- broad network access through HTTP clients, sockets, or fetch calls;
- suspicious secret handling such as logging environment variables or token-like values;
- mutating tools whose descriptions do not clearly explain side effects;
- vague or overbroad tool descriptions;
- missing security documentation;
- missing authentication or permission-boundary language;
- README claims that imply trust without explaining scope.

## Report Formats

```bash
mcp-risk-linter scan . --format markdown --out mcp-risk-report.md
mcp-risk-linter scan . --format json --out mcp-risk-report.json
mcp-risk-linter scan . --format sarif --out mcp-risk-report.sarif
```

Use `--fail-on medium` or `--fail-on high` in CI.

## Suppressions

Use suppressions only for reviewed false positives or intentionally risky tutorial fixtures. Suppressions must name the rule and include a justification:

```python
# mcp-risk-linter: ignore MCP001 -- tutorial fixture intentionally demonstrates shell execution
os.system("echo fixture")
```

The suppression can appear on the same line or the line immediately above the finding. Use `ALL` only when a line is intentionally unreviewable and the justification explains why.

## What This Is Not

This is not a full security audit, penetration test, CVE scanner, exploit detector, or official MCP compliance program. Findings are readiness signals that should help maintainers scope tools, document risk, and decide what needs human review.

This project is not affiliated with Anthropic, the Model Context Protocol project, OpenAI, or any registry operator.

## Examples

- `examples/safe_server` - narrow tools with explicit read-only descriptions and security docs.
- `examples/risky_stdio_server` - shell execution, environment leakage, and vague mutating tools.
- `examples/broad_filesystem_server` - broad filesystem and network access patterns.

## Exit Codes

- `0`: no findings at or above the configured failure threshold.
- `1`: findings met or exceeded the configured threshold.
- `2`: invalid CLI usage.

## Review Ask

If you maintain an MCP server, the most useful feedback is whether the rule taxonomy catches real review concerns without making misleading claims. The goal is narrow technical review, not endorsement.
