import type { ReactNode } from "react";

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="surface p-12 text-center animate-fade-in">
      {icon && (
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-ink-800 text-muted ring-1 ring-line">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {hint && <p className="text-sm text-muted mt-2 max-w-md mx-auto text-pretty">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 animate-fade-in">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold text-white tracking-tight text-balance">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1.5 max-w-2xl text-pretty">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
