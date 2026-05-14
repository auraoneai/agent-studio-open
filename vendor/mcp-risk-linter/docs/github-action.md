# GitHub Action

Use the action to fail pull requests when MCP server risk findings reach a configured severity threshold.

```yaml
name: mcp-risk-lint
on:
  pull_request:
  push:
    branches: [main]

jobs:
  mcp-risk-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: auraoneai/mcp-risk-linter@v0.1.0
        with:
          path: .
          fail-on: high
          format: markdown
          output: mcp-risk-report.md
          comment: "true"
```

PR comments require `issues: write` or `pull-requests: write` workflow permissions on pull request events. The action always writes the report to the job summary first, then updates a stable marker comment when `comment: "true"` is enabled.

For GitHub code scanning, run the CLI with `--format sarif --out mcp-risk.sarif`, then upload the SARIF file with `github/codeql-action/upload-sarif`.
