import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { AdapterRegistry, createJsonTraceAdapter } from "../adapters";
import { capabilities, filterSessions, traceSessions, validateJson } from "../data";
import {
  canBrowserUseTransport,
  getBrowserTraceSession,
  guardBrowserConnection,
  listBrowserTraceSessions,
  loadBrowserProviderKey,
  putBrowserTraceSession,
  saveBrowserProviderKey,
  validateByoProviderKey,
} from "../../../web/src/browserEdition";

describe("Agent Studio Open local-first logic", () => {
  it("validates JSON payloads before tool calls", () => {
    expect(validateJson('{"order_id":"ORD-1"}').ok).toBe(true);
    expect(validateJson("{broken").ok).toBe(false);
  });

  it("filters trace sessions by model, tag, and status", () => {
    expect(filterSessions(traceSessions, "refund")).toHaveLength(1);
    expect(filterSessions(traceSessions, "gpt")).toHaveLength(1);
    expect(filterSessions(traceSessions, "failed")).toHaveLength(1);
    expect(filterSessions(traceSessions, "")).toHaveLength(traceSessions.length);
  });

  it("enforces browser edition transport constraints", () => {
    expect(canBrowserUseTransport("http")).toBe(true);
    expect(canBrowserUseTransport("sse")).toBe(true);
    expect(canBrowserUseTransport("websocket")).toBe(true);
    expect(canBrowserUseTransport("stdio")).toBe(false);
    expect(guardBrowserConnection("stdio")).toEqual({
      ok: false,
      message: "Browser edition supports MCP only over SSE, HTTP, and WebSocket. It cannot spawn stdio servers.",
    });
  });

  it("keeps browser stdio and OTLP receiver disabled in the capability matrix", () => {
    const stdio = capabilities.find((capability) => capability.id === "stdio");
    const otlp = capabilities.find((capability) => capability.id === "otlp-receiver");
    expect(stdio?.browser).toBe(false);
    expect(otlp?.browser).toBe(false);
  });

  it("persists browser traces in IndexedDB", async () => {
    await putBrowserTraceSession({
      id: "browser-trace-1",
      name: "Browser trace",
      createdAt: "2026-05-13T00:00:00.000Z",
      payload: { tool: "lookup_order" },
    });
    expect((await getBrowserTraceSession("browser-trace-1"))?.name).toBe("Browser trace");
    expect(await listBrowserTraceSessions()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "browser-trace-1" })]),
    );
  });

  it("encrypts BYO provider keys with a browser passphrase", async () => {
    expect(validateByoProviderKey("openai", "sk-local-test")).toEqual({ ok: true });
    const record = await saveBrowserProviderKey("openai", "sk-local-test", "correct horse battery staple");
    expect(record.ciphertext).not.toContain("sk-local-test");
    await expect(loadBrowserProviderKey("openai", "correct horse battery staple")).resolves.toBe("sk-local-test");
    await expect(loadBrowserProviderKey("openai", "wrong passphrase")).rejects.toThrow();
  });

  it("normalizes proprietary traces through the custom adapter SDK", () => {
    const registry = new AdapterRegistry();
    registry.register(
      createJsonTraceAdapter({
        id: "internal-lab",
        label: "Internal Lab Trace",
        source: "internal-lab-json",
        traceIdField: "run_id",
        titleField: "goal",
      }),
    );
    const normalized = registry.normalize({
      source: "internal-lab-json",
      payload: {
        run_id: "lab-42",
        goal: "Refund decision",
        events: [{ type: "tool_call", name: "lookup_order", arguments: { order_id: "ORD-42" } }],
      },
    });
    expect(normalized.traceId).toBe("lab-42");
    expect(normalized.events[0]).toMatchObject({ type: "tool_call", name: "lookup_order" });
  });
});
