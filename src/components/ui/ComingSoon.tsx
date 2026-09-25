import type { ReactNode } from "react";

/**
 * The honest empty state for a module that has a list view and nothing
 * else — no create form, no edit flow, no import, no upload — so what's
 * shown is only whatever `prisma/seed.ts` happened to plant.
 *
 * `EmptyState`'s copy on these pages used to instruct an action the UI
 * never offered ("Add a supplier…", "Upload a PDF…", "Create one…"), which
 * reads as a broken button rather than an unbuilt feature (ACTION_PLAN.md
 * G3.11). Used only for the *unfiltered*, genuinely-nothing-here case —
 * "no results match your filter" is a real, already-honest empty state and
 * keeps using `EmptyState`.
 */
export function ComingSoon({
  icon,
  title,
  headingLevel = 2,
}: {
  icon?: ReactNode;
  title: string;
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
      <p className="text-sm text-muted mt-2 max-w-md mx-auto text-pretty">
        This module isn&apos;t built yet — there&apos;s no way to add, edit or import records here.
        What&apos;s shown is only what the seed data planted.
      </p>
      <span className="badge badge-muted mt-4 inline-flex">Not yet built</span>
    </div>
  );
}
