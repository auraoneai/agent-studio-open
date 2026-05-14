# MCP Risk Rule Examples

## MCP001 - shell-execution

Flag child process execution such as `subprocess.run`, `child_process.exec`, or `os.system`. These patterns may be appropriate, but installers need clear scoping, argument validation, and documentation.

## MCP002 - broad-filesystem-access

Flag reads and writes to broad locations such as `/`, `~`, `$HOME`, or recursive repository traversal. Read-only scoped access should be documented.

## MCP004 - secret-exposure

Flag code that logs environment variables or token-like values. The remediation is to avoid logging secrets and redact known sensitive fields in reports.

## MCP008 - missing-auth-boundary-docs

Flag repositories that expose tools without explaining what credentials are required, what data can be reached, and what permissions a user grants by installing the server.
