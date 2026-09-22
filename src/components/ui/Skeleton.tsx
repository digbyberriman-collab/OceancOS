/**
 * Loading-state building blocks for `loading.tsx` route segments
 * (ACTION_PLAN.md G3.8). Built on the `.shimmer` animation that already
 * existed in globals.css but nothing used.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-md bg-ink-800/80 ${className}`} />;
}

export function SkeletonPageHeader() {
  return (
    <div className="mb-6 space-y-2.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-64 max-w-full" />
      <Skeleton className="h-3.5 w-96 max-w-full" />
    </div>
  );
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="stat-card space-y-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-line px-4 py-2.5">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
