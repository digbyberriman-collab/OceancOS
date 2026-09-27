import { FlaskConical } from "lucide-react";
import { Badge } from "./Badge";

/** Marks a project or record as fictional walkthrough data. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warn" className={className}>
      <span
        className="inline-flex items-center gap-1"
        title="Fictional walkthrough data, not a real vessel's record"
      >
        <FlaskConical className="h-3 w-3" aria-hidden />
        Demo
      </span>
    </Badge>
  );
}
