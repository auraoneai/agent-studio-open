import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock3,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  prooflineStatusLabels,
  type ProoflineStatusTone,
} from "./status";
import { classes } from "./utils";

const statusIcons: Record<ProoflineStatusTone, LucideIcon> = {
  neutral: Circle,
  success: CheckCircle2,
  info: Info,
  review: Clock3,
  warning: AlertTriangle,
  danger: CircleAlert,
  blocked: Ban,
};

export function ProoflineStatus({
  tone,
  label = prooflineStatusLabels[tone],
}: {
  tone: ProoflineStatusTone;
  label?: string;
}) {
  const Icon = statusIcons[tone];
  return (
    <span className={classes("pl-status", `pl-status--${tone}`)}>
      <Icon aria-hidden="true" size={15} />
      <span>{label}</span>
    </span>
  );
}

export function ProoflineAlert({
  tone = "info",
  title,
  children,
  actions,
  className,
}: {
  tone?: ProoflineStatusTone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const Icon = statusIcons[tone];
  return (
    <div
      className={classes("pl-alert", `pl-alert--${tone}`, className)}
      role={tone === "danger" || tone === "blocked" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" size={18} />
      <div>
        <strong>{title}</strong>
        {children}
        {actions ? <div className="pl-alert__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function ProoflineSkeleton({
  label = "Loading",
  lines = 3,
  className,
}: {
  label?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-busy="true" aria-label={label} className={classes("pl-skeleton", className)} role="status">
      {Array.from({ length: lines }, (_, index) => (
        <span aria-hidden="true" key={index} />
      ))}
    </div>
  );
}

export function ProoflineState({
  title,
  description,
  tone = "neutral",
  action,
}: {
  title: string;
  description?: string;
  tone?: ProoflineStatusTone;
  action?: ReactNode;
}) {
  return (
    <div className="pl-state" role={tone === "danger" ? "alert" : "status"}>
      <ProoflineStatus tone={tone} label={title} />
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export const ProoflineUniversalState = ProoflineState;
