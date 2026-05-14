# Methodology

`mcp-risk-linter` uses deterministic static checks over repository files. It does not execute MCP servers or call external services.

The methodology is intentionally conservative:

1. Parse manifest-like JSON files and package metadata where present.
2. Extract tool names and descriptions from common MCP patterns.
3. Scan source files for high-signal risk patterns.
4. Scan docs for missing security and permission-boundary language.
5. Emit findings as review prompts, not exploit claims.

Suppressions are accepted only when the source line or immediately preceding line contains `mcp-risk-linter: ignore RULE -- justification`. The justification is required so reviewers can distinguish an accepted false positive from an accidental blind spot.

Severity reflects review urgency:

- `critical`: unsafe by default and likely to require immediate human review.
- `high`: risky capability or sensitive data path.
- `medium`: ambiguous scope or missing boundary documentation.
- `low`: hygiene/documentation issue.

This is not an official MCP compliance suite.
