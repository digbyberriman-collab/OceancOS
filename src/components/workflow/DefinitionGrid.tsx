import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** A definition list row used in detail cards. */
export function DefRow({
  label,
  children,
  className,
  span2,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  span2?: boolean;
}) {
  return (
    <div className={cn(span2 && "sm:col-span-2", className)}>
      <dt className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted mb-0.5">
        {label}
      </dt>
      <dd className="text-sm text-white leading-relaxed">{children}</dd>
    </div>
  );
}

/** Container for a definition grid. */
export function DefGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4", className)}>
      {children}
    </dl>
  );
}
