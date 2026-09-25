import { SkeletonPageHeader, SkeletonStatRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="animate-fade-up">
      <SkeletonPageHeader />
      <SkeletonStatRow count={4} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SkeletonTable rows={5} />
        </div>
        <div className="space-y-4">
          <SkeletonTable rows={4} />
        </div>
      </div>
    </div>
  );
}
