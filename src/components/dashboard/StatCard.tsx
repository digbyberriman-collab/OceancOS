import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "bad" | "muted";

const VALUE_TONE: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  muted: "text-white",
};

const ICON_TONE: Record<Tone, string> = {
  ok: "text-ok bg-ok/10 ring-ok/25",
  warn: "text-warn bg-warn/10 ring-warn/25",
  bad: "text-bad bg-bad/10 ring-bad/25",
  muted: "text-marine bg-marine/10 ring-marine/20",
};

export function StatCard({
  label,
  value,
  href,
  tone = "muted",
  icon: Icon,
}: {
  label: string;
  value: number;
  href?: string;
  tone?: Tone;
  icon: LucideIcon;
}) {
  const inner = (
    <>
      <div
        aria-hidden
        className={cn(
          "grid h-9 w-9 place-items-center rounded-lg ring-1 transition-colors duration-200",
          ICON_TONE[tone]
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </div>
      <div className="mt-3.5 stat-label">{label}</div>
      <div className={cn("stat-value tnum", VALUE_TONE[tone])}>{value}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="stat-card surface-hover group block hover:-translate-y-0.5">
        {inner}
      </Link>
    );
  }
  return <div className="stat-card">{inner}</div>;
}
