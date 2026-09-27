import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/Skeleton";

/**
 * Fallback for every route under (app) with no more specific loading.tsx
 * of its own. Every page here is `force-dynamic` and runs Prisma queries
 * before returning markup, so without this Next held the previous route
 * on screen with no feedback for the whole round trip (ACTION_PLAN.md
 * G3.8, ui-ux [LOADING STATES]).
 */
export default function Loading() {
  return (
    <div className="animate-fade-up">
      <SkeletonPageHeader />
      <SkeletonTable rows={8} />
    </div>
  );
}
