// Value formatting for charts.
//
// Charts are client components, and a server component cannot hand a client
// component a function. Callers therefore pass a small serialisable descriptor
// and the formatting happens here, on the client.

export type ChartFormat = "count" | "money" | "compactMoney" | "percent";

export function formatChartValue(n: number, format: ChartFormat, currency = "EUR"): string {
  switch (format) {
    case "money":
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
    case "compactMoney":
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
    case "percent":
      return `${Math.round(n)}%`;
    case "count":
    default:
      return n.toLocaleString("en-GB");
  }
}

export function formatChartDate(t: number): string {
  return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
