import type { ReactNode } from "react";

export function EmptyState({
  title,
  hint,
  action,
  icon,
  headingLevel = 2,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
  /**
   * EmptyState rendered an <h3> unconditionally. Fine nested under a
   * PageHeader's <h1> (though that's still a level skip — h2 is correct
   * there), but seventeen routes return a bare EmptyState as the entire page
   * body with no PageHeader above it, leaving the document with no <h1> at
   * all (ACTION_PLAN.md G5.5). Those pass 1; everyone else keeps the
   * default 2.
   */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="surface p-12 text-center animate-fade-in">
      {icon && (
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-ink-800 text-muted ring-1 ring-line">
          {icon}
        </div>
      )}
      <Heading className="text-base font-semibold text-white">{title}</Heading>
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
