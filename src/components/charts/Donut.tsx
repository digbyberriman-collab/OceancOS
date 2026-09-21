"use client";

import { useId, useState } from "react";
import { donutArcs, foldTail, type Slice } from "@/lib/charts/geometry";
import { CHART_SURFACE, DE_EMPHASIS, TEXT } from "./palette";
import { formatChartValue, type ChartFormat } from "./format";

/**
 * Part-to-whole ring with a centre figure.
 *
 * Slices past `maxSlices` fold into "Other" rather than taking new hues: a
 * generated extra hue is indistinguishable from an existing one under
 * colour-vision deficiency. Separation between slices is a gap in the surface
 * colour, never a stroke.
 */
export function Donut({
  slices,
  centreLabel,
  centreValue,
  maxSlices = 5,
  size = 180,
  thickness = 22,
  format = "count",
  currency = "EUR",
}: {
  slices: Slice[];
  centreLabel?: string;
  centreValue?: string;
  maxSlices?: number;
  size?: number;
  thickness?: number;
  /** Serialisable: a server component cannot hand a client component a function. */
  format?: ChartFormat;
  currency?: string;
}) {
  const formatValue = (n: number) => formatChartValue(n, format, currency);
  const [active, setActive] = useState<string | null>(null);
  const titleId = useId();

  const folded = foldTail(slices, maxSlices, DE_EMPHASIS);
  const total = folded.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = size / 2;
  const arcs = donutArcs(folded, { radius, thickness, gapDegrees: 2 });

  if (total <= 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">Nothing to show for this project yet.</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <svg
        width={size}
        height={size}
        viewBox={`${-radius} ${-radius} ${size} ${size}`}
        role="img"
        aria-labelledby={titleId}
        className="shrink-0"
      >
        <title id={titleId}>
          {folded.map((s) => `${s.label}: ${formatValue(s.value)}`).join(", ")}
        </title>

        {arcs.map((arc) => {
          const dimmed = active !== null && active !== arc.label;
          return (
            <path
              key={arc.label}
              d={arc.path}
              fill={arc.color}
              opacity={dimmed ? 0.35 : 1}
              style={{ transition: "opacity 150ms" }}
              onMouseEnter={() => setActive(arc.label)}
              onMouseLeave={() => setActive(null)}
            />
          );
        })}

        {/* Centre figure: proportional figures, never tabular, at this size. */}
        <text
          x={0}
          y={centreLabel ? -2 : 6}
          textAnchor="middle"
          fill={TEXT.primary}
          fontSize={size / 7}
          fontWeight={600}
        >
          {centreValue ?? formatValue(total)}
        </text>
        {centreLabel && (
          <text x={0} y={size / 9 + 6} textAnchor="middle" fill={TEXT.muted} fontSize={11}>
            {centreLabel}
          </text>
        )}
      </svg>

      {/* The legend is the dependable identity channel: never colour alone. */}
      <ul className="w-full min-w-0 space-y-1.5">
        {arcs.map((arc) => (
          <li
            key={arc.label}
            onMouseEnter={() => setActive(arc.label)}
            onMouseLeave={() => setActive(null)}
            className="flex items-center gap-2.5 text-sm"
            style={{ opacity: active !== null && active !== arc.label ? 0.5 : 1 }}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: arc.color, boxShadow: `0 0 0 2px ${CHART_SURFACE}` }}
            />
            <span className="min-w-0 flex-1 truncate text-muted">{arc.label}</span>
            <span className="shrink-0 font-medium text-white tnum">{formatValue(arc.value)}</span>
            <span className="w-10 shrink-0 text-right text-xs text-faint tnum">
              {Math.round(arc.share * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
