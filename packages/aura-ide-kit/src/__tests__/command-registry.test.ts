import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "../command-registry";

describe("createCommandRegistry", () => {
  it("registers, searches, runs, and unregisters commands", async () => {
    const handler = vi.fn();
    const registry = createCommandRegistry();
    const unregister = registry.register({
      id: "project.open-folder",
      title: "Open Folder",
      group: "Project",
      keywords: ["directory"],
      handler,
    });

    expect(registry.find("directory")).toHaveLength(1);
    await registry.run("project.open-folder");
    expect(handler).toHaveBeenCalledTimes(1);

    unregister();
    expect(registry.list()).toHaveLength(0);
  });

  it("rejects duplicate command ids", () => {
    const registry = createCommandRegistry([
      { id: "app.settings", title: "Settings", group: "Application", handler: vi.fn() },
    ]);

    expect(() =>
      registry.register({
        id: "app.settings",
        title: "Settings duplicate",
        group: "Application",
        handler: vi.fn(),
      }),
    ).toThrow("Command already registered");
  });
});
