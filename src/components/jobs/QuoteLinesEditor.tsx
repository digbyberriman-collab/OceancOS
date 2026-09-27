"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Form";

type Line = { description: string; quantity: string; unit: string; unitPrice: string };

/**
 * The live-pricing editor for a quote's lines. It renders the same inputs the
 * server action reads (positional `lineDescription` / `lineQuantity` /
 * `lineUnit` / `lineUnitPrice` arrays — see `issueQuote`), so submitting is
 * unchanged, and adds a per-row and running total as the yard types.
 *
 * The figures shown here are a display-only preview: the authoritative total
 * is still computed server-side with `Prisma.Decimal` when the quote is issued
 * (ACTION_PLAN.md G3.2). This mirrors that arithmetic — a row counts only once
 * it has a description, and a line total is quantity × unit price to 2dp — so
 * the preview agrees with the figure that gets stored.
 */
function buildInitial(rows: number, initial: (Partial<Line> | undefined)[]): Line[] {
  return Array.from({ length: rows }, (_, i) => ({
    description: initial[i]?.description ?? "",
    quantity: initial[i]?.quantity ?? (i === 0 ? "1" : ""),
    unit: initial[i]?.unit || "UN",
    unitPrice: initial[i]?.unitPrice ?? (i === 0 ? "0" : ""),
  }));
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function QuoteLinesEditor({
  currency,
  rows,
  initial,
}: {
  currency: string;
  rows: number;
  initial: (Partial<Line> | undefined)[];
}) {
  const [lines, setLines] = useState<Line[]>(() => buildInitial(rows, initial));

  // Same shape and options as `fmtMoney` (en-GB, whole currency units), so a
  // previewed figure reads identically to the one on the job once stored.
  const money = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  const update = (i: number, field: keyof Line, value: string) =>
    setLines((prev) => {
      const next = prev.slice();
      next[i] = { ...next[i], [field]: value };
      return next;
    });

  const rowTotal = (line: Line): number | null => {
    if (line.description.trim().length === 0) return null;
    const q = Number(line.quantity);
    const p = Number(line.unitPrice);
    if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
    return round2(q * p);
  };

  const grandTotal = lines.reduce((sum, line) => {
    const t = rowTotal(line);
    return t == null ? sum : sum + t;
  }, 0);
  const priced = lines.some((line) => rowTotal(line) != null);

  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th scope="col" className="w-1/2">Description</th>
            <th scope="col" className="text-right">Quantity</th>
            <th scope="col">Unit</th>
            <th scope="col" className="text-right">Unit price</th>
            <th scope="col" className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const t = rowTotal(line);
            return (
              <tr key={i}>
                <td>
                  <Input
                    name="lineDescription"
                    placeholder={i === 0 ? "Skilled worker — mechanic, pipe fitter" : ""}
                    aria-label={`Line ${i + 1} description`}
                    value={line.description}
                    onChange={(e) => update(i, "description", e.target.value)}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    name="lineQuantity"
                    value={line.quantity}
                    onChange={(e) => update(i, "quantity", e.target.value)}
                    className="text-right tnum"
                    aria-label={`Line ${i + 1} quantity`}
                  />
                </td>
                <td>
                  <Input
                    name="lineUnit"
                    value={line.unit}
                    onChange={(e) => update(i, "unit", e.target.value)}
                    className="w-20"
                    aria-label={`Line ${i + 1} unit`}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.01"
                    name="lineUnitPrice"
                    value={line.unitPrice}
                    onChange={(e) => update(i, "unitPrice", e.target.value)}
                    className="text-right tnum"
                    aria-label={`Line ${i + 1} unit price`}
                  />
                </td>
                <td className="whitespace-nowrap text-right font-medium text-white tnum">
                  {t == null ? <span className="text-faint">—</span> : money.format(t)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="text-right font-medium text-muted">
              Quote total
            </td>
            <td
              className="whitespace-nowrap text-right text-base font-semibold text-white tnum"
              aria-live="polite"
            >
              {priced ? money.format(grandTotal) : <span className="text-faint">—</span>}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
