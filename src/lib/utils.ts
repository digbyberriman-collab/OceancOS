import clsx, { type ClassValue } from "clsx";
import { Prisma } from "@prisma/client";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Money columns are `Prisma.Decimal` (ACTION_PLAN.md G3.2 — exact decimal
 * storage, not `double precision`). This is the one place that boundary is
 * crossed back to a plain `number`, for display and for non-Prisma
 * consumers (chart props, XLSX cells) that only need a number to render —
 * arithmetic that feeds back into a stored total or a signed figure should
 * use `Prisma.Decimal` directly instead, not this.
 */
export function toNumber(n: Prisma.Decimal | number | null | undefined): number {
  if (n == null) return 0;
  return n instanceof Prisma.Decimal ? n.toNumber() : n;
}

export function fmtMoney(n: Prisma.Decimal | number | null | undefined, ccy = "EUR") {
  if (n == null) return "—";
  const value = toNumber(n);
  if (Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(value);
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

