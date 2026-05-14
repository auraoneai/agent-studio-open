# Agent Trace Card

- Trace: `refund-failure-001`
- Outcome: `failed`
- Goal: Refund order A100 without issuing duplicate credits.
- Regression status: `covered by generated replay test`
- Retry count: `1`

## Tools

- `issue_refund`
- `lookup_order`

## Data Touched

- `order_id:A100`

## Failure Modes

- `duplicate_mutating_tool_call`
- `incorrect_terminal_answer`

## Human Intervention

reviewer stopped rollout after duplicate refund trace
