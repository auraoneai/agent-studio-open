# AuraOne A2A Contract Profile v1

This profile is a practical contract-test profile for agent-to-agent systems.
It is not a compliance claim.

## Required agent-card fields

- `name`: stable human-readable agent name.
- `version`: semantic version string.
- `endpoint`: HTTP or HTTPS endpoint.
- `capabilities`: non-empty list of objects with `name`, `input_modes`,
  `output_modes`, and `streaming`.
- `content_types`: supported structured content types.

## Required task lifecycle behavior

A valid transcript must show:

1. A task creation response with a stable task id and `submitted` state.
2. At least one progress state: `working` or `input_required`.
3. A terminal state: `completed`, `failed`, or `cancelled`.
4. Structured JSON payloads for task input and output when JSON is declared.
5. A structured error object for unsupported capability or malformed input.

## Redaction

Reports must redact authorization, cookie, token, secret, password, and API key
values from transcript evidence.

