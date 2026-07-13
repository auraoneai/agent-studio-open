import Editor from "@monaco-editor/react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Code2,
  Command,
  File,
  Folder,
  FolderOpen,
  Info,
  Loader2,
  Search,
  Settings,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  createContext,
  Fragment,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createCommandRegistry, type CommandRegistry } from "./command-registry";
import { AuraThemeContext } from "./theme";
import type {
  AuraCommand,
  AuraIntakePacketPreviewData,
  AuraProblem,
  AuraTab,
  AuraTelemetryEvent,
  AuraThemeMode,
  AuraTimelineItem,
  AuraTreeNode,
} from "./types";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type AuraIdeAppFrameProps = {
  productName: string;
  projectName?: string;
  commands: CommandRegistry;
  sidebar: ReactNode;
  main: ReactNode;
  inspector?: ReactNode;
  bottomPanel?: ReactNode;
  statusBar?: ReactNode;
  themeMode?: AuraThemeMode;
  onThemeModeChange?: (mode: AuraThemeMode) => void;
};

export function AuraIdeAppFrame({
  productName,
  projectName = "No project open",
  commands,
  sidebar,
  main,
  inspector,
  bottomPanel,
  statusBar,
  themeMode = "system",
  onThemeModeChange,
}: AuraIdeAppFrameProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mode, setMode] = useState<AuraThemeMode>(themeMode);

  useEffect(() => {
    setMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const themeValue = useMemo(
    () => ({
      mode,
      setMode: (nextMode: AuraThemeMode) => {
        setMode(nextMode);
        onThemeModeChange?.(nextMode);
      },
    }),
    [mode, onThemeModeChange],
  );

  return (
    <AuraThemeContext.Provider value={themeValue}>
      <div className="aura-ide-root" data-theme={mode}>
        <div className="aura-ide-titlebar">
          <div>
            <span className="aura-ide-titlebar__product">{productName}</span>
            <span className="aura-ide-titlebar__project">{projectName}</span>
          </div>
          <button className="aura-ide-icon-button" type="button" aria-label="Open command palette" onClick={() => setPaletteOpen(true)}>
            <Command size={16} />
            <span>Cmd/Ctrl K</span>
          </button>
        </div>
        <AuraSplitPane
          start={<aside className="aura-ide-sidebar">{sidebar}</aside>}
          end={
            <div className="aura-ide-workbench">
              <div className="aura-ide-main-row">
                <main className="aura-ide-main">{main}</main>
                {inspector ? <aside className="aura-ide-inspector">{inspector}</aside> : null}
              </div>
              {bottomPanel ? <section className="aura-ide-bottom-panel">{bottomPanel}</section> : null}
            </div>
          }
          defaultStartSize={280}
          minStartSize={220}
          maxStartSize={420}
        />
        <footer className="aura-ide-statusbar">{statusBar}</footer>
        <AuraCommandPalette registry={commands} open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </AuraThemeContext.Provider>
  );
}

export type AuraSplitPaneProps = {
  start: ReactNode;
  end: ReactNode;
  defaultStartSize?: number;
  minStartSize?: number;
  maxStartSize?: number;
};

export function AuraSplitPane({
  start,
  end,
  defaultStartSize = 320,
  minStartSize = 180,
  maxStartSize = 600,
}: AuraSplitPaneProps) {
  const [startSize, setStartSize] = useState(defaultStartSize);
  const dragging = useRef(false);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!dragging.current) {
        return;
      }
      const next = Math.min(maxStartSize, Math.max(minStartSize, event.clientX));
      setStartSize(next);
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [maxStartSize, minStartSize]);

  return (
    <div className="aura-split-pane" style={{ "--aura-pane-start": `${startSize}px` } as React.CSSProperties}>
      <div className="aura-split-pane__start">{start}</div>
      <div
        className="aura-split-pane__handle"
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={minStartSize}
        aria-valuemax={maxStartSize}
        aria-valuenow={startSize}
        tabIndex={0}
        onMouseDown={() => {
          dragging.current = true;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            setStartSize((value) => Math.max(minStartSize, value - 16));
          }
          if (event.key === "ArrowRight") {
            setStartSize((value) => Math.min(maxStartSize, value + 16));
          }
        }}
      />
      <div className="aura-split-pane__end">{end}</div>
    </div>
  );
}

export type AuraProjectTreeProps = {
  nodes: AuraTreeNode[];
  selectedId?: string | undefined;
  onSelect?: ((node: AuraTreeNode) => void) | undefined;
};

export function AuraProjectTree({ nodes, selectedId, onSelect }: AuraProjectTreeProps) {
  return (
    <div className="aura-tree" role="tree" aria-label="Project files">
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} selectedId={selectedId} depth={0} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  selectedId,
  depth,
  onSelect,
}: {
  node: AuraTreeNode;
  selectedId?: string | undefined;
  depth: number;
  onSelect?: ((node: AuraTreeNode) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(node.expanded ?? true);
  const hasChildren = Boolean(node.children?.length);
  const Icon = node.kind === "folder" ? (expanded ? FolderOpen : Folder) : File;

  const activate = () => {
    if (node.kind === "folder" && hasChildren) {
      setExpanded((value) => !value);
    }
    onSelect?.(node);
  };

  return (
    <Fragment>
      <button
        type="button"
        role="treeitem"
        aria-expanded={node.kind === "folder" ? expanded : undefined}
        aria-selected={selectedId === node.id}
        className="aura-tree-row"
        style={{ "--aura-tree-depth": depth } as React.CSSProperties}
        onClick={activate}
      >
        {hasChildren ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="aura-tree-row__spacer" />}
        <Icon size={15} />
        <span className="aura-tree-row__name">{node.name}</span>
        {node.dirty ? <CircleDot className="aura-tree-row__dirty" size={10} aria-label="Dirty" /> : null}
        {node.conflict ? <ShieldAlert className="aura-tree-row__conflict" size={13} aria-label="Conflict" /> : null}
        {node.badge ? <span className="aura-tree-row__badge">{node.badge}</span> : null}
      </button>
      {expanded && node.children?.map((child) => <TreeNode key={child.id} node={child} selectedId={selectedId} depth={depth + 1} onSelect={onSelect} />)}
    </Fragment>
  );
}

export type AuraTabbedShellProps = {
  tabs: AuraTab[];
  activeTabId: string;
  onActiveTabChange: (id: string) => void;
  onCloseTab?: (id: string) => void;
};

export function AuraTabbedShell({ tabs, activeTabId, onActiveTabChange, onCloseTab }: AuraTabbedShellProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <div className="aura-tabs">
      <div className="aura-tabs__bar" role="tablist" aria-label="Open editors">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab?.id}
            className="aura-tabs__tab"
            onClick={() => onActiveTabChange(tab.id)}
            onMouseDown={(event) => {
              if (event.button === 1) {
                onCloseTab?.(tab.id);
              }
            }}
          >
            {tab.icon}
            <span>{tab.title}</span>
            {tab.dirty ? <Circle size={8} fill="currentColor" aria-label="Unsaved changes" /> : null}
            {onCloseTab ? (
              <span
                role="button"
                tabIndex={0}
                className="aura-tabs__close"
                aria-label={`Close ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
              >
                <X size={13} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="aura-tabs__panel" role="tabpanel">
        {activeTab?.content}
      </div>
    </div>
  );
}

export type AuraMonacoProps = {
  value: string;
  language?: string;
  path?: string;
  readOnly?: boolean;
  theme?: "light" | "dark" | "high-contrast";
  onChange?: (value: string) => void;
};

export function AuraMonaco({ value, language = "typescript", path, readOnly = false, theme = "dark", onChange }: AuraMonacoProps) {
  const editorProps = path ? { path } : {};

  return (
    <div className="aura-monaco">
      <Editor
        value={value}
        language={language}
        {...editorProps}
        theme={theme === "light" ? "vs" : theme === "high-contrast" ? "hc-black" : "vs-dark"}
        options={{
          readOnly,
          automaticLayout: true,
          minimap: { enabled: false },
          fontFamily: "var(--ag-font-mono)",
          fontSize: 13,
          renderLineHighlight: "line",
          scrollBeyondLastLine: false,
          tabSize: 2,
        }}
        onChange={(nextValue) => onChange?.(nextValue ?? "")}
      />
    </div>
  );
}

export function AuraTimeline({ items }: { items: AuraTimelineItem[] }) {
  return (
    <ol className="aura-timeline" aria-label="Timeline">
      {items.map((item) => (
        <li key={item.id} className={cx("aura-timeline__item", `aura-timeline__item--${item.severity ?? "neutral"}`)}>
          <span className="aura-timeline__dot" />
          <div>
            <div className="aura-timeline__title">{item.title}</div>
            <time className="aura-timeline__time" dateTime={item.timestamp}>
              {item.timestamp}
            </time>
            {item.description ? <p>{item.description}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AuraInspector({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="aura-panel" aria-label={title}>
      <header className="aura-panel__header">
        <Info size={15} />
        <h2>{title}</h2>
      </header>
      <div className="aura-panel__body">{children}</div>
    </section>
  );
}

export type AuraCommandPaletteProps = {
  registry: CommandRegistry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AuraCommandPalette({ registry, open, onOpenChange }: AuraCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const commands = registry.find(query);

  if (!open) {
    return null;
  }

  const grouped = commands.reduce<Map<string, AuraCommand[]>>((groups, command) => {
    const groupCommands = groups.get(command.group) ?? [];
    groupCommands.push(command);
    groups.set(command.group, groupCommands);
    return groups;
  }, new Map());

  const runCommand = async (command: AuraCommand) => {
    await registry.run(command.id);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <div className="aura-modal-backdrop" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <div className="aura-command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <label className="aura-command-palette__search">
          <Search size={16} />
          <input autoFocus value={query} placeholder="Search commands" onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
        <div className="aura-command-palette__results">
          {Array.from(grouped.entries()).map(([group, groupCommands]) => (
            <div key={group} className="aura-command-palette__group">
              <div className="aura-command-palette__group-title">{group}</div>
              {groupCommands.map((command) => (
                <button key={command.id} type="button" disabled={command.disabled} className="aura-command-palette__item" onClick={() => void runCommand(command)}>
                  <span>{command.title}</span>
                  {command.keybinding ? <kbd>{command.keybinding}</kbd> : null}
                </button>
              ))}
            </div>
          ))}
          {!commands.length ? <AuraEmptyState title="No commands" description="Refine the query or register commands through the platform registry." /> : null}
        </div>
      </div>
    </div>
  );
}

export function AuraStatusBar({ items }: { items: Array<{ id: string; label: string; value?: string; tone?: "neutral" | "success" | "warning" | "error" }> }) {
  return (
    <div className="aura-status-items" role="status">
      {items.map((item) => (
        <span key={item.id} className={cx("aura-status-item", `aura-status-item--${item.tone ?? "neutral"}`)}>
          {item.label}
          {item.value ? <strong>{item.value}</strong> : null}
        </span>
      ))}
    </div>
  );
}

export function AuraProblemsPanel({ problems }: { problems: AuraProblem[] }) {
  const icon = {
    info: <Info size={14} />,
    warning: <AlertTriangle size={14} />,
    error: <ShieldAlert size={14} />,
  };

  return (
    <section className="aura-panel" aria-label="Problems">
      <header className="aura-panel__header">
        <AlertTriangle size={15} />
        <h2>Problems</h2>
        <span className="aura-panel__count">{problems.length}</span>
      </header>
      <div className="aura-problems">
        {problems.map((problem) => (
          <div key={problem.id} className={cx("aura-problem", `aura-problem--${problem.severity}`)}>
            {icon[problem.severity]}
            <span>{problem.message}</span>
            <code>{[problem.path, problem.line, problem.column].filter(Boolean).join(":")}</code>
          </div>
        ))}
        {!problems.length ? <AuraEmptyState title="No problems" description="Project checks are clean." compact /> : null}
      </div>
    </section>
  );
}

export function AuraSettingsPanel({
  productName,
  telemetryEnabled,
  crashReportsEnabled,
  onTelemetryChange,
  onCrashReportsChange,
}: {
  productName: string;
  telemetryEnabled: boolean;
  crashReportsEnabled: boolean;
  onTelemetryChange: (enabled: boolean) => void;
  onCrashReportsChange: (enabled: boolean) => void;
}) {
  const { mode, setMode } = useContext(AuraThemeContext);

  return (
    <section className="aura-panel" aria-label={`${productName} settings`}>
      <header className="aura-panel__header">
        <Settings size={15} />
        <h2>Settings</h2>
      </header>
      <div className="aura-settings">
        <label>
          <span>Theme</span>
          <select value={mode} onChange={(event) => setMode(event.currentTarget.value as AuraThemeMode)}>
            <option value="system">Follow OS</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </label>
        <label>
          <span>Telemetry</span>
          <input type="checkbox" checked={telemetryEnabled} onChange={(event) => onTelemetryChange(event.currentTarget.checked)} />
        </label>
        <label>
          <span>Crash reports</span>
          <input type="checkbox" checked={crashReportsEnabled} onChange={(event) => onCrashReportsChange(event.currentTarget.checked)} />
        </label>
      </div>
    </section>
  );
}

export type AuraWelcomePrivacyWizardProps = {
  productWorkNoun?: string;
  telemetryEnabled: boolean;
  crashReportsEnabled: boolean;
  onTelemetryChange: (enabled: boolean) => void;
  onCrashReportsChange: (enabled: boolean) => void;
  onComplete: () => void;
};

export function AuraWelcomePrivacyWizard({
  productWorkNoun = "rubrics, datasets, or agent traces",
  telemetryEnabled,
  crashReportsEnabled,
  onTelemetryChange,
  onCrashReportsChange,
  onComplete,
}: AuraWelcomePrivacyWizardProps) {
  return (
    <section className="aura-privacy-wizard" aria-label="Welcome privacy choices">
      <article>
        <h2>Help improve AuraOne Open Studio</h2>
        <p>If you opt in, the app will send us anonymous usage signals so we can prioritize what to build next. We will never send the contents of your work.</p>
        <strong>What we send</strong>
        <ul>
          <li>Anonymous install ID</li>
          <li>App version and OS</li>
          <li>High-level feature usage</li>
          <li>Error counts</li>
          <li>Session length</li>
        </ul>
        <strong>What we never send</strong>
        <ul>
          <li>Your {productWorkNoun}</li>
          <li>API keys</li>
          <li>File paths or hostnames</li>
          <li>Anything you typed into the editor</li>
        </ul>
        <label>
          <input type="checkbox" checked={telemetryEnabled} onChange={(event) => onTelemetryChange(event.currentTarget.checked)} />
          <span>Help improve AuraOne Open Studio (opt in)</span>
        </label>
        <p>Don't send anything (default)</p>
      </article>
      <article>
        <h2>Help us fix what breaks</h2>
        <p>If something crashes, we'd love to know so we can fix it. We can send an anonymous crash report to AuraOne if you opt in.</p>
        <strong>What we send</strong>
        <ul>
          <li>The stack trace and minidump from the crash</li>
          <li>Your OS and app version</li>
          <li>An install-scoped random ID</li>
        </ul>
        <strong>What we never send</strong>
        <ul>
          <li>The contents of your {productWorkNoun}</li>
          <li>API keys</li>
          <li>File paths or hostnames</li>
        </ul>
        <label>
          <input type="checkbox" checked={crashReportsEnabled} onChange={(event) => onCrashReportsChange(event.currentTarget.checked)} />
          <span>Send crash reports</span>
        </label>
        <p>Don't send anything</p>
      </article>
      <button type="button" onClick={onComplete}>
        Continue
      </button>
    </section>
  );
}

export type AuraUpdatePromptProps = {
  version: string;
  releaseNotes: string;
  signedBy: string;
  mandatory?: boolean;
  onInstallNow: () => void;
  onInstallOnRestart: () => void;
  onRemindLater: () => void;
};

export function AuraUpdatePrompt({
  version,
  releaseNotes,
  signedBy,
  mandatory = false,
  onInstallNow,
  onInstallOnRestart,
  onRemindLater,
}: AuraUpdatePromptProps) {
  return (
    <section className="aura-update-prompt" aria-label="Software update">
      <header>
        <CheckCircle2 size={18} />
        <div>
          <h2>Update available</h2>
          <p>Version {version}</p>
        </div>
      </header>
      <pre>{releaseNotes}</pre>
      <p title={`Signed by ${signedBy}`}>Signed by {signedBy}</p>
      <div>
        <button type="button" onClick={onInstallOnRestart}>
          Install next launch
        </button>
        <button type="button" onClick={onInstallNow}>
          Install now
        </button>
        <button type="button" onClick={onRemindLater} disabled={mandatory}>
          Remind later
        </button>
      </div>
    </section>
  );
}

export type AuraIntakeIdentityFieldsProps = {
  displayName: string;
  email?: string;
  intent: string;
  onDisplayNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onIntentChange: (value: string) => void;
};

export function AuraIntakeIdentityFields({
  displayName,
  email = "",
  intent,
  onDisplayNameChange,
  onEmailChange,
  onIntentChange,
}: AuraIntakeIdentityFieldsProps) {
  return (
    <section className="aura-intake-identity" aria-label="Intake identity">
      <label>
        <span>Display name</span>
        <input type="text" value={displayName} required autoComplete="name" onChange={(event) => onDisplayNameChange(event.currentTarget.value)} />
      </label>
      <label>
        <span>Email (optional)</span>
        <input type="email" value={email} autoComplete="email" onChange={(event) => onEmailChange(event.currentTarget.value)} />
      </label>
      <label>
        <span>Intent note</span>
        <textarea value={intent} required rows={4} onChange={(event) => onIntentChange(event.currentTarget.value)} />
      </label>
    </section>
  );
}

export type AuraKeychainFallbackWarningProps = {
  backendKind: "macos-keychain" | "windows-credential-manager" | "linux-secret-service" | "linux-encrypted-file-fallback";
  firstSecretSet?: boolean;
  onDismiss?: () => void;
};

export function AuraKeychainFallbackWarning({
  backendKind,
  firstSecretSet = false,
  onDismiss,
}: AuraKeychainFallbackWarningProps) {
  if (backendKind !== "linux-encrypted-file-fallback" || !firstSecretSet) {
    return null;
  }

  return (
    <section className="aura-keychain-warning" role="status" aria-label="Linux keychain fallback warning">
      <ShieldAlert size={18} />
      <div>
        <strong>Linux Secret Service is unavailable</strong>
        <p>
          AuraOne stored this secret in the encrypted local fallback store. Install or unlock a Secret Service provider to use the native Linux keychain.
        </p>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </section>
  );
}

type Toast = { id: string; title: string; description?: string; tone?: "info" | "success" | "warning" | "error" };
type ToastContextValue = { push: (toast: Omit<Toast, "id">) => void; dismiss: (id: string) => void };
const ToastContext = createContext<ToastContextValue>({ push: () => undefined, dismiss: () => undefined });

export function AuraToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const value = useMemo<ToastContextValue>(
    () => ({
      push(toast) {
        setToasts((current) => [...current, { ...toast, id: crypto.randomUUID() }]);
      },
      dismiss(id) {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="aura-toast-region" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx("aura-toast", `aura-toast--${toast.tone ?? "info"}`)}>
            <Bell size={15} />
            <div>
              <strong>{toast.title}</strong>
              {toast.description ? <p>{toast.description}</p> : null}
            </div>
            <button type="button" aria-label="Dismiss notification" onClick={() => value.dismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useAuraToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function AuraModal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) {
    return null;
  }
  return (
    <div className="aura-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="aura-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="aura-modal__header">
          <h2>{title}</h2>
          <button type="button" aria-label="Close modal" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="aura-modal__body">{children}</div>
      </section>
    </div>
  );
}

export function AuraEmptyState({ title, description, compact = false }: { title: string; description?: string; compact?: boolean }) {
  return (
    <div className={cx("aura-state", compact && "aura-state--compact")}>
      <Code2 size={compact ? 18 : 28} />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function AuraLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="aura-state" role="status">
      <Loader2 className="aura-spin" size={28} />
      <strong>{label}</strong>
    </div>
  );
}

export function AuraErrorState({ title, description, onRetry }: { title: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="aura-state aura-state--error" role="alert">
      <ShieldAlert size={28} />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function AuraTelemetryEventLog({ events }: { events: AuraTelemetryEvent[] }) {
  return (
    <section className="aura-panel" aria-label="Telemetry event log">
      <header className="aura-panel__header">
        <CheckCircle2 size={15} />
        <h2>Telemetry Event Log</h2>
      </header>
      <div className="aura-event-log">
        {events.length ? (
          events.map((event) => (
            <article key={event.id} className="aura-event-log__row">
              <div>
                <strong>{event.name}</strong>
                <time dateTime={event.timestamp}>{event.timestamp}</time>
              </div>
              <span>
                {event.deliveryStatus === "local_preview"
                  ? "local preview"
                  : event.deliveryStatus === "would_send"
                    ? "not sent"
                    : event.destination === "local"
                      ? "local only"
                      : "delivery unverified"}
              </span>
              <pre
                tabIndex={0}
                role="region"
                aria-label={`${event.name} payload preview`}
              >
                {JSON.stringify(event.payloadPreview, null, 2)}
              </pre>
            </article>
          ))
        ) : (
          <AuraEmptyState
            compact
            title="No local events"
            description="Eligible diagnostics appear here after they are recorded. This log does not confirm network delivery."
          />
        )}
      </div>
    </section>
  );
}

export const AURA_INTAKE_PRIVACY_URL = "https://auraone.ai/open/privacy/intake";
export const AURA_INTAKE_PRIVACY_COPY = {
  sent: [
    "A manifest describing the project metadata you entered.",
    "The payload files you reviewed in the preview screen above.",
    "A signature from your local install (used only for deduplication).",
  ],
  neverSent: [
    "Your API keys.",
    "File paths from your machine (replaced with <PROJECT>/... references).",
    "Hostnames or environment variables.",
    "Anything you did not see in the preview screen above.",
  ],
  consent:
    "If you cancel before clicking Send, nothing leaves your machine. If you click Send, the only thing that leaves your machine is the contents of the packet you just reviewed.",
};

export type AuraIntakePacketPreviewProps = {
  packet: AuraIntakePacketPreviewData;
  manifestTree?: Record<string, unknown>;
  consentChecked?: boolean;
  onConsentChange?: (checked: boolean) => void;
  privacyUrl?: string;
};

export function AuraIntakePacketPreview({
  packet,
  manifestTree,
  consentChecked = false,
  onConsentChange,
  privacyUrl = AURA_INTAKE_PRIVACY_URL,
}: AuraIntakePacketPreviewProps) {
  const totalBytes = packet.includedFiles.reduce((sum, file) => sum + file.bytes, 0);

  return (
    <section className="aura-panel" aria-label="Intake packet preview">
      <header className="aura-panel__header">
        <FolderOpen size={15} />
        <h2>Intake Packet</h2>
      </header>
      <dl className="aura-packet-summary">
        <div>
          <dt>Packet</dt>
          <dd>{packet.packetId}</dd>
        </div>
        <div>
          <dt>Flagship</dt>
          <dd>{packet.flagship}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{packet.schemaVersion}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>
            {packet.includedFiles.length} / {new Intl.NumberFormat("en", { notation: "compact" }).format(totalBytes)}B
          </dd>
        </div>
      </dl>
      <div className="aura-packet-files">
        {packet.includedFiles.map((file) => (
          <div key={file.path}>
            <code>{file.path}</code>
            <span>{file.role}</span>
          </div>
        ))}
      </div>
      <div className="aura-packet-exclusions">
        <strong>Excluded</strong>
        {packet.excludedPatterns.map((pattern) => (
          <code key={pattern}>{pattern}</code>
        ))}
      </div>
      {packet.warnings.length ? (
        <div className="aura-packet-warnings">
          {packet.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {manifestTree ? (
        <section className="aura-packet-manifest" aria-label="Manifest tree">
          <h3>Manifest Tree</h3>
          <pre>{JSON.stringify(manifestTree, null, 2)}</pre>
        </section>
      ) : null}
      {onConsentChange ? (
        <section className="aura-packet-privacy" aria-label="Intake privacy review">
          <h3>What is sent in an intake packet?</h3>
          <p>A single zip file containing:</p>
          <ul>
            {AURA_INTAKE_PRIVACY_COPY.sent.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>What is never sent in an intake packet?</h3>
          <ul>
            {AURA_INTAKE_PRIVACY_COPY.neverSent.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{AURA_INTAKE_PRIVACY_COPY.consent}</p>
          <a href={privacyUrl}>Read the intake privacy policy</a>
          <label className="aura-packet-consent">
            <input type="checkbox" required checked={consentChecked} onChange={(event) => onConsentChange(event.currentTarget.checked)} />
            <span>I reviewed this packet and consent to send only the contents shown above.</span>
          </label>
        </section>
      ) : null}
    </section>
  );
}

export type AuraFileWatcherStatusProps = {
  state: "connected" | "polling" | "disabled";
  watchedPath?: string;
  eventsQueued?: number;
};

export function AuraFileWatcherStatus({ state, watchedPath, eventsQueued = 0 }: AuraFileWatcherStatusProps) {
  const tone = state === "connected" ? "success" : state === "polling" ? "warning" : "neutral";
  return (
    <section className={cx("aura-file-watcher", `aura-file-watcher--${tone}`)} aria-live="polite" aria-label="File watcher status">
      <div>
        <Bell size={15} />
        <strong>{state === "connected" ? "Watching" : state === "polling" ? "Polling" : "Watcher disabled"}</strong>
      </div>
      {watchedPath ? <code>{watchedPath}</code> : null}
      <span>{eventsQueued} queued</span>
    </section>
  );
}

export type AuraWelcomeWindowProps = {
  productName: string;
  recentProjects: Array<{ name: string; path: string }>;
  onOpenFolder: () => void;
  onOpenRecent: (path: string) => void;
};

export function AuraWelcomeWindow({ productName, recentProjects, onOpenFolder, onOpenRecent }: AuraWelcomeWindowProps) {
  return (
    <section className="aura-welcome" aria-label={`${productName} welcome`}>
      <header>
        <Code2 size={22} />
        <div>
          <h1>{productName}</h1>
          <p>Local-first project workspace</p>
        </div>
      </header>
      <button type="button" className="aura-welcome__primary" onClick={onOpenFolder}>
        <FolderOpen size={16} />
        <span>Open Folder</span>
      </button>
      {recentProjects.length ? (
        <nav aria-label="Recent projects">
          {recentProjects.map((project) => (
            <button key={project.path} type="button" onClick={() => onOpenRecent(project.path)}>
              <Folder size={15} />
              <span>{project.name}</span>
              <code>{project.path}</code>
            </button>
          ))}
        </nav>
      ) : null}
    </section>
  );
}

export function AuraPanel({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("aura-panel", className)} {...props}>
      {children}
    </section>
  );
}

export function createDefaultIdeCommands(openFolder: () => void, openSettings: () => void): CommandRegistry {
  return createCommandRegistry([
    {
      id: "project.open-folder",
      title: "Open Folder",
      group: "Project",
      keybinding: "Mod+O",
      handler: openFolder,
    },
    {
      id: "app.settings",
      title: "Open Settings",
      group: "Application",
      keybinding: "Mod+,",
      handler: openSettings,
    },
  ]);
}

export function isCommandPaletteKey(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}
