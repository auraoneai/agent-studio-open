export type AgentStudioUpdateResult =
  | { status: "current" }
  | { status: "available"; version: string; notes: string }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

export async function checkForAgentStudioUpdate(): Promise<AgentStudioUpdateResult> {
  if (
    typeof window === "undefined" ||
    !("__TAURI_INTERNALS__" in window)
  ) {
    return {
      status: "unavailable",
      reason: "Browser edition cannot install signed desktop updates.",
    };
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return { status: "current" };
    return {
      status: "available",
      version: update.version,
      notes: update.body ?? "A signed desktop update is available.",
    };
  } catch (error) {
    return {
      status: "error",
      reason:
        error instanceof Error
          ? error.message
          : "The signed update check failed.",
    };
  }
}
