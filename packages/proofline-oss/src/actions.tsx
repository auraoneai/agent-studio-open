import { LoaderCircle } from "lucide-react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";
import { classes } from "./utils";

export type ProoflineButtonVariant =
  | "primary"
  | "secondary"
  | "quiet"
  | "danger";

export type ProoflineButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ProoflineButtonVariant;
  loading?: boolean;
};

export function ProoflineButton({
  variant = "secondary",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ProoflineButtonProps) {
  return (
    <button
      className={classes(
        "pl-button",
        variant !== "secondary" && `pl-button--${variant}`,
        className,
      )}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="pl-spin" size={16} /> : null}
      {children}
    </button>
  );
}

export function ProoflineLinkButton({
  variant = "secondary",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ProoflineButtonVariant;
}) {
  return (
    <a
      className={classes(
        "pl-button",
        "pl-link-button",
        variant !== "secondary" && `pl-button--${variant}`,
        className,
      )}
      {...props}
    />
  );
}

export function ProoflineIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  tooltip?: string;
  children: ReactElement;
}) {
  return (
    <button
      aria-label={label}
      className={classes("pl-icon-button", className)}
      data-tooltip={tooltip}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function ProoflineButtonGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div aria-label={label} className={classes("pl-button-group", className)} role="group">
      {children}
    </div>
  );
}

export function ProoflineMenuButton({
  label,
  expanded,
  controls,
  onClick,
  children,
  className,
}: {
  label: string;
  expanded: boolean;
  controls: string;
  onClick: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <ProoflineButton
      aria-controls={controls}
      aria-expanded={expanded}
      aria-haspopup="menu"
      className={className}
      onClick={onClick}
      type="button"
    >
      {children ?? label}
    </ProoflineButton>
  );
}
