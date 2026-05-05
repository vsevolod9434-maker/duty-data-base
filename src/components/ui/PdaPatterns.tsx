import type { ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type PanelProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "default" | "accent" | "muted";
};

export function Panel({ children, className, id, tone = "default" }: PanelProps) {
  return (
    <section className={cx("ui-panel", `ui-panel-${tone}`, className)} id={id}>
      {children}
    </section>
  );
}

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: string;
  children?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, meta, children, className }: PageHeaderProps) {
  return (
    <div className={cx("ui-page-header", className)}>
      <div className="ui-page-header-copy">
        {eyebrow ? <span className="ui-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="ui-page-header-aside">
        {meta ? <span className="ui-header-meta">{meta}</span> : null}
        {children}
      </div>
    </div>
  );
}

type StatCardProps = {
  code: string;
  label: string;
  value: string | number;
};

export function StatCard({ code, label, value }: StatCardProps) {
  return (
    <div className="ui-stat-card">
      <span>{code}</span>
      <strong>{value}</strong>
      <p>{label}</p>
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description?: string;
  className?: string;
};

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cx("empty-state ui-empty-state", className)}>
      <p>{title}</p>
      {description ? <span>{description}</span> : null}
    </div>
  );
}

type SectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cx("section-header registry-section-header", className)}>
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="toolbar-row registry-toolbar">{actions}</div> : null}
    </div>
  );
}

type RegistryPanelProps = {
  children: ReactNode;
  className?: string;
  tone?: "list" | "detail" | "default";
};

export function RegistryPanel({ children, className, tone = "default" }: RegistryPanelProps) {
  return (
    <section className={cx("registry-panel", `registry-panel-${tone}`, className)}>
      {children}
    </section>
  );
}

type InfoGridProps = {
  children: ReactNode;
  className?: string;
};

export function InfoGrid({ children, className }: InfoGridProps) {
  return <dl className={cx("info-grid registry-info-grid", className)}>{children}</dl>;
}

type InfoFieldProps = {
  label: string;
  value: ReactNode;
  className?: string;
};

export function InfoField({ label, value, className }: InfoFieldProps) {
  return (
    <div className={cx("info-field registry-info-field", className)}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type StatusBadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "active" | "danger" | "muted";
  className?: string;
};

export function StatusBadge({ children, tone = "neutral", className }: StatusBadgeProps) {
  return <span className={cx("badge-chip", `registry-status-badge-${tone}`, className)}>{children}</span>;
}
