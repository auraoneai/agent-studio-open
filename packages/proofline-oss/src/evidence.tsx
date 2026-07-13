import { FileCheck2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { ProoflineStatusTone } from "./status";
import { ProoflineStatus } from "./states";
import { classes } from "./utils";

export type ProoflineEvidenceItem = {
  label: string;
  value: ReactNode;
};

export function Proofline({
  label = "Evidence",
  value,
  provenance,
  className,
}: {
  label?: string;
  value: ReactNode;
  provenance?: string;
  className?: string;
}) {
  return (
    <div className={classes("pl-proofline", className)}>
      <FileCheck2 aria-hidden="true" size={17} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {provenance ? <small>{provenance}</small> : null}
      </div>
    </div>
  );
}

export function ProoflineEvidencePacket({
  title,
  description,
  items,
  actions,
  className,
}: {
  title: string;
  description?: string;
  items: ProoflineEvidenceItem[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <article className={classes("pl-evidence-packet", className)}>
      <header>
        <ShieldCheck aria-hidden="true" size={20} />
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      {actions ? <footer>{actions}</footer> : null}
    </article>
  );
}

export function ProoflineDecisionGate({
  decision,
  tone,
  rationale,
  nextAction,
  className,
}: {
  decision: string;
  tone: ProoflineStatusTone;
  rationale: ReactNode;
  nextAction?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={`Decision: ${decision}`} className={classes("pl-decision-gate", className)}>
      <ProoflineStatus label={decision} tone={tone} />
      <div>{rationale}</div>
      {nextAction ? <div className="pl-decision-gate__action">{nextAction}</div> : null}
    </section>
  );
}

export type ProoflineAuditEvent = {
  id: string;
  title: string;
  timestamp: string;
  description?: ReactNode;
  tone?: ProoflineStatusTone;
};

export function ProoflineAuditTimeline({
  events,
  label = "Audit timeline",
  className,
}: {
  events: ProoflineAuditEvent[];
  label?: string;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={classes("pl-audit-timeline", className)}>
      {events.map((event) => (
        <li key={event.id}>
          <div>
            <ProoflineStatus label={event.title} tone={event.tone ?? "neutral"} />
            <time dateTime={event.timestamp}>{event.timestamp}</time>
          </div>
          {event.description ? <div>{event.description}</div> : null}
        </li>
      ))}
    </ol>
  );
}
