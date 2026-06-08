import { fmtMoney } from "@/lib/utils";
import { cn } from "@/lib/utils";

type CellTone = "ok" | "warn" | "bad" | "neutral";

const CELL_TONE: Record<CellTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-white",
};

function Cell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: CellTone;
}) {
  return (
    <div className="rounded-lg border border-line-soft bg-ink-950/40 px-3 py-2.5">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 text-base font-semibold tnum tracking-tight", CELL_TONE[tone])}>
        {value}
      </div>
    </div>
  );
}

export function BudgetSummary({
  original,
  approved,
  pending,
  actual,
  forecast,
}: {
  original: number;
  approved: number;
  pending: number;
  actual: number;
  forecast: number;
}) {
  const baseline = original + approved;
  const overBudget = forecast > baseline;

  // Progress bar geometry: actual + forecast measured against the larger of
  // baseline or forecast so the bar always fits.
  const scale = Math.max(baseline, forecast, 1);
  const actualPct = Math.min(100, Math.max(0, (actual / scale) * 100));
  const forecastPct = Math.min(100, Math.max(0, (forecast / scale) * 100));
  const baselinePct = Math.min(100, Math.max(0, (baseline / scale) * 100));
  const variance = forecast - baseline;

  return (
    <div className="space-y-4">
      {/* Forecast vs baseline progress bar */}
      <div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">Forecast vs baseline</span>
          <span
            className={cn(
              "tnum font-medium",
              overBudget ? "text-bad" : "text-ok"
            )}
          >
            {variance >= 0 ? "+" : "−"}
            {fmtMoney(Math.abs(variance))}
          </span>
        </div>
        <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink-950 ring-1 ring-line-soft">
          {/* Forecast fill */}
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out",
              overBudget
                ? "bg-gradient-to-r from-bad/70 to-bad"
                : "bg-gradient-to-r from-accent to-accent-bright"
            )}
            style={{ width: `${forecastPct}%` }}
          />
          {/* Actual spend (darker, on top) */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-marine/80 transition-[width] duration-500 ease-out"
            style={{ width: `${actualPct}%` }}
          />
          {/* Baseline marker */}
          <div
            aria-hidden
            className="absolute inset-y-[-2px] w-0.5 bg-white/70"
            style={{ left: `calc(${baselinePct}% - 1px)` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-marine/80" /> Actual
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", overBudget ? "bg-bad" : "bg-accent-bright")} /> Forecast
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-white/70" /> Baseline
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Cell label="Original" value={fmtMoney(original)} />
        <Cell label="Approved Δ" value={fmtMoney(approved)} />
        <Cell label="Pending Δ" value={fmtMoney(pending)} tone="warn" />
        <Cell label="Actual" value={fmtMoney(actual)} />
        <Cell label="Forecast" value={fmtMoney(forecast)} tone={overBudget ? "bad" : "ok"} />
      </div>
    </div>
  );
}
