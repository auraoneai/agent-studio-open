# MCP Risk Taxonomy v1

The v1 taxonomy focuses on risks that matter when a user or organization decides whether to install an MCP server.

## Tool Capability Risk

- Shell execution.
- Filesystem reads and writes.
- Network calls.
- Browser or desktop automation.
- Credential or secret access.
- External side effects such as sending email, creating issues, modifying tickets, or purchasing.

## Documentation Risk

- Missing security policy.
- Missing authentication boundary.
- Missing side-effect language.
- Vague tool descriptions.
- Claims of safety or trust without scope.

## Data Risk

- Logging environment variables.
- Logging request payloads without redaction.
- Reading unscoped home-directory paths.
- Writing unscoped output files.

The taxonomy should be updated only with examples and tests.
