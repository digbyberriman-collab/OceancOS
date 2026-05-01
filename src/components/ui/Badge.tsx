import { cn } from "@/lib/utils";
import { STATUS_TONE } from "@/lib/enums";

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
  return <Badge tone={tone}>{value.replace(/_/g, " ")}</Badge>;
}

export function PriorityBadge({ value }: { value: string }) {
  const tone = STATUS_TONE[value] ?? "muted";
  return <Badge tone={tone}>{value}</Badge>;
}
