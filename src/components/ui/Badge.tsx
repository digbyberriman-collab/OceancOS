import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/enums";

const TONE_CLASS: Record<string, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  bad: "badge-bad",
  info: "badge-info",
  muted: "badge-muted",
};

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "bad" | "info" | "muted";
  className?: string;
}) {
  return <span className={cn("badge", TONE_CLASS[tone], className)}>{children}</span>;
}

export function StatusBadge({ value }: { value: string }) {
  const tone = STATUS_TONE[value] ?? "muted";
  // Job statuses carry proper labels; everything else is de-underscored.
  const label = STATUS_LABELS[value] ?? value.replace(/_/g, " ");
  return <Badge tone={tone}>{label}</Badge>;
}

export function PriorityBadge({ value }: { value: string }) {
  const tone = STATUS_TONE[value] ?? "muted";
  return <Badge tone={tone}>{value}</Badge>;
}
