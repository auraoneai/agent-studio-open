import type { HTMLAttributes, ReactNode } from "react";
import { classes } from "./utils";

export function ProoflineAppShell({
  header,
  navigation,
  inspector,
  children,
  className,
}: {
  header?: ReactNode;
  navigation?: ReactNode;
  inspector?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={classes("pl-root", "pl-app-shell", className)}>
      {header ? <header className="pl-app-shell__header">{header}</header> : null}
      {navigation ? <nav aria-label="Primary" className="pl-app-shell__nav">{navigation}</nav> : null}
      <main className="pl-app-shell__main">{children}</main>
      {inspector ? <aside aria-label="Inspector" className="pl-app-shell__inspector">{inspector}</aside> : null}
    </div>
  );
}

export function ProoflinePageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: {
  title: string;
  description?: string;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={classes("pl-page-header", className)}>
      <div>
        {breadcrumbs}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="pl-page-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ProoflineSection({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={classes("pl-section", className)} {...props}>
      <div className="pl-section__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function ProoflineSurface({
  as: Component = "div",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article";
}) {
  return <Component className={classes("pl-surface", className)} {...props} />;
}

export function ProoflinePanel({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={classes("pl-panel", className)} aria-label={label}>
      {children}
    </section>
  );
}

export function ProoflineToolbar({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div aria-label={label} className={classes("pl-toolbar", className)} role="toolbar">
      {children}
    </div>
  );
}

export function ProoflineInspector({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside aria-label={title} className={classes("pl-inspector", className)}>
      <h2>{title}</h2>
      {children}
    </aside>
  );
}
