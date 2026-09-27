import { Skeleton, SkeletonPageHeader, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="animate-fade-up">
      <SkeletonPageHeader />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      <SkeletonTable rows={8} />
    </div>
  );
}
