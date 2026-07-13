import type { ReactNode } from "react";

export type AuraThemeMode = "system" | "light" | "dark" | "high-contrast";

export type AuraCommand = {
  id: string;
  title: string;
  group: string;
  keybinding?: string;
  keywords?: string[];
  disabled?: boolean;
  handler: () => void | Promise<void>;
};

export type AuraTreeNode = {
  id: string;
  name: string;
  kind: "file" | "folder";
  path: string;
  children?: AuraTreeNode[];
  dirty?: boolean;
  conflict?: boolean;
  badge?: string;
  expanded?: boolean;
};

export type AuraTab = {
  id: string;
  title: string;
  path?: string;
  dirty?: boolean;
  icon?: ReactNode;
  content: ReactNode;
};

export type AuraProblem = {
  id: string;
  severity: "info" | "warning" | "error";
  source: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
};

export type AuraTimelineItem = {
  id: string;
  title: string;
  timestamp: string;
  description?: string;
  severity?: "neutral" | "success" | "warning" | "error";
};

export type AuraTelemetryEvent = {
  id: string;
  name: string;
  timestamp: string;
  optedIn: boolean;
  destination: "local" | "telemetry" | "crash" | "intake";
  deliveryStatus?: "local_preview" | "would_send";
  payloadPreview: Record<string, unknown>;
};

export type AuraIntakePacketPreviewData = {
  packetId: string;
  flagship: "rubric-studio" | "robotics-studio" | "agent-studio";
  schemaVersion: string;
  payloadRoles: string[];
  includedFiles: Array<{ path: string; role: string; bytes: number }>;
  excludedPatterns: string[];
  warnings: string[];
};
