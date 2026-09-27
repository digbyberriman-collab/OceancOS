import { Badge } from "@/components/ui/Badge";
import { CONFIDENCE_LABELS, type ConfidenceLevel } from "@/lib/enums";

const TONE: Record<ConfidenceLevel, "ok" | "info" | "warn"> = {
  HIGH: "ok",
  MEDIUM: "info",
  LOW: "warn",
};

/** How far a published yard period, or a source for one, can be relied on. */
export function ConfidenceBadge({ value }: { value: string | null }) {
  if (!value || !(value in TONE)) return null;
  const level = value as ConfidenceLevel;
  return <Badge tone={TONE[level]}>{CONFIDENCE_LABELS[level]}</Badge>;
}
