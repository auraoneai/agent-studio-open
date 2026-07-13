import { Search } from "lucide-react";
import {
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ProoflineInput } from "./forms";
import { classes } from "./utils";

export type ProoflineNavItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

export function ProoflineBreadcrumbs({
  items,
  className,
}: {
  items: Array<{ label: string; href?: string }>;
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={classes("pl-breadcrumbs", className)}>
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href && index < items.length - 1
              ? <a href={item.href}>{item.label}</a>
              : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function nextEnabled(items: ProoflineNavItem[], current: number, delta: number) {
  let candidate = current;
  do {
    candidate = (candidate + delta + items.length) % items.length;
  } while (items[candidate]?.disabled && candidate !== current);
  return candidate;
}

export function ProoflineTabs({
  items,
  value,
  onValueChange,
  ariaLabel = "Views",
  className,
}: {
  items: ProoflineNavItem[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.id === value);
    if (current < 0) return;
    let target = current;
    if (event.key === "ArrowRight") target = nextEnabled(items, current, 1);
    else if (event.key === "ArrowLeft") target = nextEnabled(items, current, -1);
    else if (event.key === "Home") target = items.findIndex((item) => !item.disabled);
    else if (event.key === "End") {
      target = [...items].map((item, index) => ({ item, index })).reverse()
        .find(({ item }) => !item.disabled)?.index ?? current;
    } else return;
    event.preventDefault();
    onValueChange(items[target].id);
  };
  return (
    <div aria-label={ariaLabel} className={classes("pl-tabs", className)} onKeyDown={onKeyDown} role="tablist">
      {items.map((item) => (
        <button
          aria-selected={item.id === value}
          disabled={item.disabled}
          key={item.id}
          onClick={() => onValueChange(item.id)}
          role="tab"
          tabIndex={item.id === value ? 0 : -1}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ProoflineSegmentedControl(props: Parameters<typeof ProoflineTabs>[0]) {
  return <ProoflineTabs {...props} className={classes("pl-segmented", props.className)} />;
}

export function ProoflineMenu({
  id,
  label,
  items,
  onSelect,
  className,
}: {
  id?: string;
  label: string;
  items: ProoflineNavItem[];
  onSelect: (id: string) => void;
  className?: string;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not(:disabled)",
      ),
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") items[0].focus();
    else if (event.key === "End") items[items.length - 1].focus();
    else {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      items[(current + delta + items.length) % items.length].focus();
    }
  };
  return (
    <div
      aria-label={label}
      className={classes("pl-menu", className)}
      id={id}
      onKeyDown={onKeyDown}
      role="menu"
    >
      {items.map((item) => (
        <button
          disabled={item.disabled}
          key={item.id}
          onClick={() => onSelect(item.id)}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ProoflineCommandPalette({
  open,
  commands,
  onSelect,
  onClose,
  title = "Command palette",
}: {
  open: boolean;
  commands: ProoflineNavItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const titleId = useId();
  if (!open) return null;
  const visible = commands.filter((command) =>
    command.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="pl-command"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="dialog"
    >
      <h2 className="pl-visually-hidden" id={titleId}>{title}</h2>
      <label className="pl-command__search">
        <Search aria-hidden="true" size={16} />
        <span className="pl-visually-hidden">Search commands</span>
        <ProoflineInput autoFocus value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      </label>
      <div aria-label="Commands" className="pl-menu" role="menu">
        {visible.map((command) => (
          <button
            disabled={command.disabled}
            key={command.id}
            onClick={() => onSelect(command.id)}
            role="menuitem"
            type="button"
          >
            {command.label}
          </button>
        ))}
        {visible.length === 0 ? <p>No matching commands</p> : null}
      </div>
    </div>
  );
}
