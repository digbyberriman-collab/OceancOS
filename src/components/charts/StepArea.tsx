"use client";

import { useId, useRef, useState } from "react";
import {
  buildScales,
  niceTicks,
  stepAreaPath,
  stepLinePath,
  valueAt,
  type SeriesPoint,
} from "@/lib/charts/geometry";
import { CHART_SURFACE, GRID, TEXT } from "./palette";
import { formatChartDate, formatChartValue, type ChartFormat } from "./format";

export type StepSeries = {
  key: string;
  label: string;
  color: string;
  points: SeriesPoint[];
};

/**
 * Cumulative money over time, as steps.
 *
 * Cumulative totals change on the day something happens and hold flat between,
 * so a stepped line states what happened; a smooth line would invent movement.
 * Both series share one y-axis — two scales on one chart is never the answer.
 *
 * Ships a crosshair and tooltip by default, and a table view underneath, so
 * every value is reachable without hovering.
 */
export function StepArea({
  series,
  height = 200,
  format = "money",
  currency = "EUR",
}: {
  series: StepSeries[];
  /** viewBox height: sets the chart's aspect ratio, not its pixel height. */
  height?: number;
  /** Serialisable: a server component cannot hand a client component a function. */
  format?: ChartFormat;
  currency?: string;
}) {
  const formatValue = (n: number) => formatChartValue(n, format, currency);
  const formatDate = formatChartDate;
  const [hoverT, setHoverT] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const titleId = useId();

  const width = 720; // viewBox units; the SVG scales to its container
  const box = { width, height, padLeft: 56, padRight: 16, padTop: 12, padBottom: 26 };
  const withPoints = series.filter((s) => s.points.length > 0);

  if (!withPoints.length) {
    return <p className="py-8 text-center text-sm text-muted">No activity recorded yet.</p>;
  }

  // Hold each series flat to the shared right edge. A cumulative total does not
  // cease to exist because nothing was added lately; stopping the line early
  // reads as missing data rather than as a plateau.
  const lastT = Math.max(...withPoints.map((s) => s.points[s.points.length - 1].t));
  const held = withPoints.map((s) => {
    const last = s.points[s.points.length - 1];
    return last.t < lastT ? { ...s, points: [...s.points, { t: lastT, v: last.v }] } : s;
  });

  // Ticks first, then scale the plot to the top tick, so the highest gridline
  // is the top of the plot instead of rendering off the canvas above it.
  const dataMax = Math.max(...held.flatMap((s) => s.points.map((p) => p.v)));
  const ticks = niceTicks(dataMax, 4);
  const axisMax = ticks[ticks.length - 1];
  const scales = buildScales(held.map((s) => s.points), box, axisMax);

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // The SVG scales, so map client pixels back into viewBox units.
    const x = ((event.clientX - rect.left) / rect.width) * width;
    if (x < box.padLeft || x > width - box.padRight) {
      setHoverT(null);
      return;
    }
    const ratio = (x - box.padLeft) / (width - box.padLeft - box.padRight);
    setHoverT(scales.tMin + ratio * (scales.tMax - scales.tMin));
  }

  const hoverX = hoverT === null ? null : scales.x(hoverT);
  const readings =
    hoverT === null
      ? []
      : held
          .map((s) => ({ ...s, value: valueAt(s.points, hoverT) }))
          .filter((r) => r.value !== null);

  return (
    <div>
      {/* Legend first: identity never rests on colour alone. */}
      <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {held.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs text-muted">
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        // Scale uniformly to the container width; the viewBox sets the aspect.
        // A fixed pixel height would make the SVG fit both axes and sit centred,
        // leaving gutters, and forcing the aspect would distort strokes and
        // turn the round end markers into ellipses.
        className="block h-auto w-full"
        role="img"
        aria-labelledby={titleId}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverT(null)}
      >
        <title id={titleId}>
          {held
            .map((s) => `${s.label} reaching ${formatValue(s.points[s.points.length - 1].v)}`)
            .join("; ")}
        </title>

        {/* Gridlines: hairline, solid, recessive. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={box.padLeft}
              x2={width - box.padRight}
              y1={scales.y(tick)}
              y2={scales.y(tick)}
              style={{ stroke: GRID }}
              strokeWidth={1}
            />
            <text
              x={box.padLeft - 8}
              y={scales.y(tick) + 3}
              textAnchor="end"
              fontSize={10}
              style={{ fill: TEXT.muted, fontVariantNumeric: "tabular-nums" }}
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {held.map((s) => (
          <g key={s.key}>
            <path d={stepAreaPath(s.points, scales)} style={{ fill: s.color }} opacity={0.1} />
            <path
              d={stepLinePath(s.points, scales)}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}

        {/* End markers, ringed in the surface colour so they stay legible
            where the two series cross. */}
        {withPoints.map((s) => {
          const last = s.points[s.points.length - 1];
          return (
            <circle
              key={`${s.key}-end`}
              cx={scales.x(last.t)}
              cy={scales.y(last.v)}
              r={4}
              style={{ fill: s.color, stroke: CHART_SURFACE }}
              strokeWidth={2}
            />
          );
        })}

        {/* Time axis: first and last only. Dense date ticks are noise here. */}
        <text x={box.padLeft} y={height - 8} style={{ fill: TEXT.muted }} fontSize={10}>
          {formatDate(scales.tMin)}
        </text>
        <text x={width - box.padRight} y={height - 8} textAnchor="end" style={{ fill: TEXT.muted }} fontSize={10}>
          {formatDate(scales.tMax)}
        </text>

        {hoverX !== null && (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={box.padTop}
              y2={height - box.padBottom}
              style={{ stroke: TEXT.muted }}
              strokeWidth={1}
            />
            {readings.map((r) => (
              <circle
                key={`${r.key}-hover`}
                cx={hoverX}
                cy={scales.y(r.value!)}
                r={4}
                style={{ fill: r.color, stroke: CHART_SURFACE }}
                strokeWidth={2}
              />
            ))}
          </>
        )}
      </svg>

      {hoverT !== null && readings.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line-soft bg-ink-850/60 px-3 py-2 text-xs">
          <span className="font-medium text-white tnum">{formatDate(hoverT)}</span>
          {readings.map((r) => (
            <span key={r.key} className="flex items-center gap-1.5 text-muted">
              <span
                aria-hidden
                className="h-2 w-2 rounded-sm"
                style={{ background: r.color }}
              />
              {r.label}
              <span className="font-medium text-white tnum">{formatValue(r.value!)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Table view: every value reachable without a mouse. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-white">
          View as table
        </summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                {held.map((s) => (
                  <th key={s.key} className="text-right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDates(held).map((t) => (
                <tr key={t}>
                  <td className="tnum">{formatDate(t)}</td>
                  {held.map((s) => (
                    <td key={s.key} className="text-right tnum">
                      {valueAt(s.points, t) === null ? "—" : formatValue(valueAt(s.points, t)!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function allDates(series: StepSeries[]): number[] {
  const set = new Set<number>();
  for (const s of series) for (const p of s.points) set.add(p.t);
  return [...set].sort((a, b) => a - b);
}
