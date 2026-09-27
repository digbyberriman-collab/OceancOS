import { Skeleton, SkeletonPageHeader, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="animate-fade-up space-y-5">
      <SkeletonPageHeader />
      <Skeleton className="h-12 w-full rounded-lg" />
      <SkeletonTable rows={5} />
    </div>
  );
}
