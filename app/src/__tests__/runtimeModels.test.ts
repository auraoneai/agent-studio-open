import { describe, expect, it } from "vitest";
import {
  normalizeCompareResult,
  normalizeReplayResult,
  normalizeTraceImportResult,
  unwrapRuntimeResult,
} from "../runtimeModels";

describe("runtime result normalization", () => {
  it("builds a populated trace session from the CLI import payload", () => {
    const session = normalizeTraceImportResult(
      {
        session_id: "refund-runtime",
        store: "/tmp/refund.ast",
        format: "replay",
        trace: {
          trace_id: "refund-runtime",
          goal: "Refund order A100",
          events: [
            {
              type: "tool_call",
              tool_name: "lookup_order",
              arguments: { order_id: "A100" },
            },
            {
              type: "tool_result",
              tool_name: "lookup_order",
              output: { status: "paid" },
            },
            {
              type: "final_answer",
              output: "Refund issued.",
            },
          ],
        },
      },
      {
        tracePath: "/tmp/refund.json",
        format: "replay",
        storePath: "/tmp/refund.ast",
        createdAt: "2026-07-12T12:00:00.000Z",
      },
    );

    expect(session).toMatchObject({
      id: "refund-runtime",
      name: "Refund order A100",
      status: "passed",
      createdAt: "2026-07-12T12:00:00.000Z",
      tags: ["imported", "replay"],
    });
    expect(session.events).toHaveLength(3);
    expect(session.events[0]).toMatchObject({
      kind: "tool-call",
      title: "lookup_order",
      timestamp: "00:00:01",
    });
    expect(session.events[1]).toMatchObject({
      kind: "tool-result",
      title: "lookup_order",
    });
    expect(session.events[2]).toMatchObject({
      kind: "model",
      title: "Model response",
    });
  });

  it("retains useful replay assertion JSON from an expected nonzero exit", () => {
    const evidence = normalizeReplayResult(
      {
        payload: [
          {
            name: "tool_order",
            ok: false,
            detail:
              "observed=['lookup_order', 'refund_order'] expected=['lookup_order']",
          },
          {
            name: "final_answer_contains",
            ok: true,
            detail:
              "expected substring `confirmed` in `Refund confirmed`",
          },
        ],
        exitCode: 1,
        expectedNonzero: true,
      },
      {
        replayPath: "refund.json",
        assertionsPath: "refund.assertions.yaml",
        durationMs: 42,
      },
    );

    expect(evidence.exitCode).toBe(1);
    expect(evidence.status).toBe("failed");
    expect(evidence.durationMs).toBe(42);
    expect(evidence.assertions).toEqual({
      passed: 1,
      review: 0,
      failed: 1,
    });
    expect(evidence.changes[0]).toMatchObject({
      label: "tool_order",
      baseline: "['lookup_order']",
      candidate: "['lookup_order', 'refund_order']",
      verdict: "fail",
    });
  });

  it("adds a top-level replay final_answer to the imported timeline", () => {
    const session = normalizeTraceImportResult(
      {
        session_id: "refund-top-level-final",
        trace: {
          trace_id: "refund-top-level-final",
          goal: "Refund order A100",
          events: [
            {
              type: "tool_call",
              tool_name: "issue_refund",
              arguments: { order_id: "A100" },
            },
          ],
          final_answer: "Refund R200 issued.",
        },
      },
      {
        tracePath: "/tmp/refund.json",
        format: "replay",
        storePath: "/tmp/refund.ast",
      },
    );

    expect(session.events).toHaveLength(2);
    expect(session.events[1]).toMatchObject({
      kind: "model",
      title: "Model response",
      body: "Refund R200 issued.",
    });
  });

  it("turns CLI compare output into the populated matrix contract", () => {
    const evidence = normalizeCompareResult(
      {
        payload: {
          passed: false,
          differences: ["turn 2 arguments changed"],
          baseline: [
            {
              tool_name: "lookup_order",
              arguments: { order_id: "A100" },
              status: "ok",
            },
            {
              tool_name: "issue_refund",
              arguments: { amount: 42 },
              status: "ok",
            },
          ],
          candidate: [
            {
              tool_name: "lookup_order",
              arguments: { order_id: "A100" },
              status: "ok",
            },
            {
              tool_name: "issue_refund",
              arguments: { amount: 41 },
              status: "ok",
            },
          ],
        },
        exitCode: 1,
        expectedNonzero: true,
      },
      {
        baselinePath: "/tmp/baseline.ast",
        candidatePath: "/tmp/candidate.ast",
        durationMs: 75,
      },
    );

    expect(evidence.exitCode).toBe(1);
    expect(evidence.columns).toEqual(["baseline.ast", "candidate.ast"]);
    expect(evidence.rows).toHaveLength(3);
    expect(evidence.rows[1].values[1]).toMatchObject({
      verdict: "review",
    });
    expect(evidence.rows[2]).toMatchObject({
      label: "Difference 1",
      values: [
        { verdict: "pass", detail: "Baseline contract" },
        { verdict: "review", detail: "turn 2 arguments changed" },
      ],
    });
    expect(evidence.summary[1].review).toBe(2);
  });

  it("leaves successful raw command payloads unwrapped", () => {
    expect(unwrapRuntimeResult({ passed: true })).toEqual({
      payload: { passed: true },
      exitCode: 0,
      expectedNonzero: false,
    });
  });
});
