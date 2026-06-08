import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A `.surface` card with a titled header and optional header-end slot.
 * Used to organise sections inside detail pages.
 */
export function SectionCard({
  title,
  headerRight,
  children,
  className,
  noPad,
}: {
  title?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set to skip the default p-5 padding (use when content has its own padding, e.g. a table). */
  noPad?: boolean;
}) {
  return (
    <div className={cn("surface overflow-hidden", className)}>
      {title && (
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-line">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
          {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
        </div>
      )}
      <div className={cn(!noPad && "p-5")}>{children}</div>
    </div>
  );
}
