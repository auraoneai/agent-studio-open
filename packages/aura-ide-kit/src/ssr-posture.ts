export type AuraSsrPosture = "ssr-safe" | "client-only" | "client-only-with-suspense";

export type AuraComponentPosture = {
  component: string;
  posture: AuraSsrPosture;
  rationale: string;
};

export const AURA_IDE_COMPONENT_POSTURE: AuraComponentPosture[] = [
  { component: "AuraIdeAppFrame", posture: "client-only", rationale: "Registers keyboard listeners for the command palette." },
  { component: "AuraSplitPane", posture: "client-only", rationale: "Uses pointer and keyboard resizing state." },
  { component: "AuraProjectTree", posture: "client-only", rationale: "Owns expandable tree state." },
  { component: "AuraMonaco", posture: "client-only-with-suspense", rationale: "Wraps Monaco editor, which is browser-only." },
  { component: "AuraTimeline", posture: "ssr-safe", rationale: "Static list rendering when handlers are not attached." },
  { component: "AuraInspector", posture: "ssr-safe", rationale: "Static panel rendering." },
  { component: "AuraCommandPalette", posture: "client-only", rationale: "Interactive modal search and command execution." },
  { component: "AuraStatusBar", posture: "ssr-safe", rationale: "Static status item rendering." },
  { component: "AuraProblemsPanel", posture: "ssr-safe", rationale: "Static diagnostic list rendering." },
  { component: "AuraSettingsPanel", posture: "client-only", rationale: "Interactive privacy toggles." },
  { component: "AuraWelcomePrivacyWizard", posture: "client-only", rationale: "Interactive telemetry and crash opt-in choices." },
  { component: "AuraUpdatePrompt", posture: "client-only", rationale: "Interactive install/remind update actions." },
  { component: "AuraIntakeIdentityFields", posture: "client-only", rationale: "Controlled intake contact and intent form inputs." },
  { component: "AuraKeychainFallbackWarning", posture: "client-only", rationale: "Dismissible first-use Linux keychain fallback warning." },
  { component: "AuraToastProvider", posture: "client-only", rationale: "Owns transient notification state." },
  { component: "AuraModal", posture: "client-only", rationale: "Interactive dialog state and dismissal." },
  { component: "AuraEmptyState", posture: "ssr-safe", rationale: "Static empty-state rendering." },
  { component: "AuraLoadingState", posture: "ssr-safe", rationale: "Static loading-state rendering." },
  { component: "AuraErrorState", posture: "ssr-safe", rationale: "Static error-state rendering." },
  { component: "AuraTelemetryEventLog", posture: "ssr-safe", rationale: "Static event-list rendering when data is supplied." },
  { component: "AuraIntakePacketPreview", posture: "ssr-safe", rationale: "Static packet preview rendering." },
  { component: "AuraFileWatcherStatus", posture: "ssr-safe", rationale: "Static watcher status rendering when data is supplied." },
  { component: "AuraWelcomeWindow", posture: "client-only", rationale: "Interactive open-folder and recent-project actions." },
  { component: "AuraTabbedShell", posture: "client-only", rationale: "Interactive tab selection." },
];

export function postureFor(component: string): AuraComponentPosture | undefined {
  return AURA_IDE_COMPONENT_POSTURE.find((entry) => entry.component === component);
}
