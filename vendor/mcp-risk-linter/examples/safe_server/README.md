# Safe MCP Server Example

This synthetic MCP server fixture exposes read-only project metadata tools. It documents authentication and permission boundaries.

## Security

The server requires no credentials, tokens, or external network access. It can read only the local fixture metadata under this directory and does not write files.

## Permissions

No OAuth, API key, filesystem write, shell, or network permissions are required.
