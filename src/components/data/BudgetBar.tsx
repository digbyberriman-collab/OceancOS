import { cn } from "@/lib/utils";

/**
 * Inline budget progress bar used in the financials table.
 * Shows actual spend vs forecast vs budget baseline — pure CSS divs, no JS.
 */
export function BudgetBar({
  actual,
  forecast,
  budget,
  className,
}: {
  actual: number;
  forecast: number;
  budget: number; // originalAmount + approvedChanges
  className?: string;
}) {
  if (budget <= 0 && forecast <= 0) return null;
  const scale = Math.max(budget, forecast, 1);
  const actualPct = Math.min(100, Math.max(0, (actual / scale) * 100));
  const forecastPct = Math.min(100, Math.max(0, (forecast / scale) * 100));
  const budgetPct = Math.min(100, Math.max(0, (budget / scale) * 100));
  const over = forecast > budget;

  return (
    <div
      className={cn("relative h-1.5 w-full min-w-[64px] overflow-hidden rounded-full bg-ink-800 ring-1 ring-line-soft", className)}
      title={`Actual: ${actual.toLocaleString()} | Forecast: ${forecast.toLocaleString()} | Budget: ${budget.toLocaleString()}`}
      aria-hidden
    >
      {/* Forecast fill */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          over
            ? "bg-gradient-to-r from-bad/60 to-bad/90"
            : "bg-gradient-to-r from-accent/70 to-accent-bright/80"
        )}
        style={{ width: `${forecastPct}%` }}
      />
      {/* Actual spend — darker, on top */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-marine/70"
        style={{ width: `${actualPct}%` }}
      />
      {/* Budget baseline marker */}
      <div
        className="absolute inset-y-[-1px] w-px bg-white/60"
        style={{ left: `calc(${budgetPct}% - 0.5px)` }}
      />
    </div>
  );
}
