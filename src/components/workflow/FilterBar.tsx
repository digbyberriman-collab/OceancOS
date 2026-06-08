import type { ReactNode } from "react";
import Link from "next/link";

/**
 * A horizontal filter / search bar wrapped in a `<form method="get">`.
 * Renders slot-based children (the actual filter inputs), plus Apply / Reset buttons.
 *
 * Usage (Server Component):
 *   <FilterBar resetHref="/change-orders">
 *     <label>…</label>
 *   </FilterBar>
 */
export function FilterBar({
  children,
  resetHref,
  resultCount,
  resultLabel = "result",
}: {
  children: ReactNode;
  resetHref: string;
  resultCount?: number;
  resultLabel?: string;
}) {
  return (
    <div className="surface mb-5 overflow-hidden">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 px-4 py-3.5"
      >
        {children}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button className="btn" type="submit">
            Apply filters
          </button>
          <Link href={resetHref} className="btn-ghost">
            Reset
          </Link>
        </div>
      </form>
      {resultCount !== undefined && (
        <div className="border-t border-line px-4 py-2 text-[11px] text-muted">
          <span className="tnum font-medium text-white">{resultCount}</span>
          &nbsp;{resultLabel}
          {resultCount !== 1 ? "s" : ""} found
        </div>
      )}
    </div>
  );
}

/** A single labelled filter field inside <FilterBar>. */
export function FilterField({
  label,
  children,
  flex,
}: {
  label: string;
  children: ReactNode;
  flex?: boolean;
}) {
  return (
    <label className={flex ? "flex-1 min-w-[180px]" : "min-w-[130px]"}>
      <span className="label-base">{label}</span>
      {children}
    </label>
  );
}
