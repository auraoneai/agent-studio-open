import { X } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { ProoflineIconButton } from "./actions";
import { classes } from "./utils";

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  );
}

function OverlayPanel({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  kind: "dialog" | "drawer";
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  useDismiss(open, onClose);
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']",
      )?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      restoreFocus.current?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className={classes("pl-overlay", `pl-overlay--${kind}`)} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={classes("pl-overlay__panel", className)}
        onKeyDown={(event) => {
          if (event.key !== "Tab" || !panelRef.current) return;
          const focusable = getFocusable(panelRef.current);
          if (focusable.length === 0) {
            event.preventDefault();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        ref={panelRef}
        role="dialog"
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <ProoflineIconButton label={`Close ${title}`} onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </ProoflineIconButton>
        </header>
        <div className="pl-overlay__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ProoflineDialog(props: Omit<Parameters<typeof OverlayPanel>[0], "kind">) {
  return <OverlayPanel {...props} kind="dialog" />;
}

export function ProoflineDrawer({
  side = "right",
  ...props
}: Omit<Parameters<typeof OverlayPanel>[0], "kind"> & {
  side?: "left" | "right";
}) {
  return <OverlayPanel {...props} className={classes(`pl-drawer--${side}`, props.className)} kind="drawer" />;
}

export function ProoflinePopover({
  trigger,
  children,
  label,
  align = "start",
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  label: string;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [open]);
  const triggerProps = trigger.props as {
    "aria-describedby"?: string;
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  };
  const enhancedTrigger = cloneElement(trigger, {
    "aria-controls": id,
    "aria-expanded": open,
    "aria-haspopup": "dialog",
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      triggerProps.onClick?.(event);
      if (!event.defaultPrevented) setOpen((value) => !value);
    },
  } as HTMLAttributes<HTMLElement>);
  return (
    <div className={classes("pl-popover", className)} ref={rootRef}>
      {enhancedTrigger}
      {open ? (
        <div aria-label={label} className={classes("pl-popover__content", `pl-popover__content--${align}`)} id={id} role="dialog">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function ProoflineTooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: ReactElement;
  className?: string;
}) {
  const id = useId();
  const child = Children.only(children);
  if (!isValidElement(child)) return child;
  const childProps = child.props as { "aria-describedby"?: string };
  return (
    <span className={classes("pl-tooltip", className)}>
      {cloneElement(child, {
        "aria-describedby": [childProps["aria-describedby"], id].filter(Boolean).join(" "),
      } as HTMLAttributes<HTMLElement>)}
      <span id={id} role="tooltip">{content}</span>
    </span>
  );
}
