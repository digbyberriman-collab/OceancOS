import { SkeletonPageHeader, SkeletonStatRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="animate-fade-up">
      <SkeletonPageHeader />
      <SkeletonStatRow count={6} />
      <SkeletonTable rows={6} />
    </div>
  );
}
