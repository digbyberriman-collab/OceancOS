// Chart geometry.
//
// Pure functions with no React and no DOM, so the maths behind every mark is
// unit-testable. The components in components/charts render what these return.

export type Slice = {
  label: string;
  value: number;
  /** Hex fill. De-emphasised slices pass the muted token. */
  color: string;
};

export type ArcSlice = Slice & {
  /** SVG path for the ring segment. */
  path: string;
  share: number;
  startAngle: number;
  endAngle: number;
};

const TAU = Math.PI * 2;

/**
 * Fold a long tail into a single "Other" slice.
 *
 * Past roughly seven classes a donut stops being readable, and the answer is
 * never more hues. Slices are ordered by value so the tail is the smallest.
 */
export function foldTail(slices: Slice[], keep: number, otherColor: string): Slice[] {
  if (keep < 1 || slices.length <= keep) return slices;
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, keep);
  const tail = sorted.slice(keep);
  const tailValue = tail.reduce((sum, s) => sum + s.value, 0);
  if (tailValue <= 0) return head;
  return [...head, { label: "Other", value: tailValue, color: otherColor }];
}

/**
 * Lay a donut out as arc paths.
 *
 * `gapDegrees` is drawn as a surface-coloured gap rather than a stroke: the
 * separation is negative space, never extra ink. A slice too small to survive
 * the gap keeps a hairline of width so it is still hoverable.
 */
export function donutArcs(
  slices: Slice[],
  opts: { radius: number; thickness: number; gapDegrees?: number; startAngle?: number }
): ArcSlice[] {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total <= 0) return [];

  const gap = ((opts.gapDegrees ?? 2) * Math.PI) / 180;
  // Only slices that are actually drawn consume a gap.
  const drawn = slices.filter((s) => s.value > 0);
  let angle = opts.startAngle ?? -Math.PI / 2;

  return drawn.map((slice) => {
    const share = Math.max(0, slice.value) / total;
    const full = share * TAU;
    // Never let the gap eat a slice entirely.
    const swept = Math.max(full - gap, Math.min(full, 0.008));
    const start = angle;
    const end = angle + swept;
    angle += full;
    return {
      ...slice,
      share,
      startAngle: start,
      endAngle: end,
      path: ringSegmentPath(start, end, opts.radius, opts.thickness),
    };
  });
}

/** An annular segment between two angles. */
export function ringSegmentPath(
  startAngle: number,
  endAngle: number,
  radius: number,
  thickness: number
): string {
  const inner = Math.max(0, radius - thickness);
  const sweep = endAngle - startAngle;
  const large = sweep > Math.PI ? 1 : 0;

  // A full ring cannot be drawn as one arc; split it into two halves.
  if (sweep >= TAU - 1e-6) {
    const mid = startAngle + Math.PI;
    return [
      ringSegmentPath(startAngle, mid, radius, thickness),
      ringSegmentPath(mid, startAngle + TAU, radius, thickness),
    ].join(" ");
  }

  const p = (angle: number, r: number) => `${(Math.cos(angle) * r).toFixed(3)} ${(Math.sin(angle) * r).toFixed(3)}`;

  return [
    `M ${p(startAngle, radius)}`,
    `A ${radius} ${radius} 0 ${large} 1 ${p(endAngle, radius)}`,
    `L ${p(endAngle, inner)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${p(startAngle, inner)}`,
    "Z",
  ].join(" ");
}

/** A meter arc: a fraction of a full ring, starting at twelve o'clock. */
export function meterPath(fraction: number, radius: number, thickness: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  if (clamped <= 0) return "";
  const start = -Math.PI / 2;
  return ringSegmentPath(start, start + clamped * TAU, radius, thickness);
}

export type SeriesPoint = { t: number; v: number };

export type PlotBox = { width: number; height: number; padLeft: number; padRight: number; padTop: number; padBottom: number };

export type Scales = {
  x: (t: number) => number;
  y: (v: number) => number;
  tMin: number;
  tMax: number;
  vMin: number;
  vMax: number;
};

/**
 * Build linear scales across every series, so the series share one axis.
 *
 * A second y-scale is never produced: two measures of different magnitude
 * belong in two charts, not two axes on one.
 */
export function buildScales(
  series: SeriesPoint[][],
  box: PlotBox,
  vMaxOverride?: number
): Scales {
  const all = series.flat();
  const times = all.map((p) => p.t);
  const values = all.map((p) => p.v);

  const tMin = times.length ? Math.min(...times) : 0;
  const tMaxRaw = times.length ? Math.max(...times) : 1;
  const tMax = tMaxRaw === tMin ? tMin + 1 : tMaxRaw;

  const vMin = 0; // Value axes start at zero; a truncated baseline overstates change.
  const vMaxRaw = values.length ? Math.max(...values) : 0;
  // Callers pass the top gridline here so the plot ends on a labelled tick
  // rather than cutting the axis mid-air above the last one.
  const vMax = vMaxOverride && vMaxOverride > 0 ? vMaxOverride : vMaxRaw <= 0 ? 1 : vMaxRaw;

  const innerW = box.width - box.padLeft - box.padRight;
  const innerH = box.height - box.padTop - box.padBottom;

  return {
    tMin,
    tMax,
    vMin,
    vMax,
    x: (t) => box.padLeft + ((t - tMin) / (tMax - tMin)) * innerW,
    y: (v) => box.padTop + innerH - ((v - vMin) / (vMax - vMin)) * innerH,
  };
}

/**
 * A step path. Cumulative money changes on the day it changes and holds flat
 * between, so a stepped line states it honestly where a smooth line would
 * invent movement that never happened.
 */
export function stepLinePath(points: SeriesPoint[], scales: Scales): string {
  if (!points.length) return "";
  const parts: string[] = [];
  points.forEach((point, i) => {
    const x = scales.x(point.t);
    const y = scales.y(point.v);
    if (i === 0) {
      parts.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
      return;
    }
    // Hold the previous value to this x, then step to the new value.
    parts.push(`L ${x.toFixed(2)} ${scales.y(points[i - 1].v).toFixed(2)}`);
    parts.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
  });
  return parts.join(" ");
}

/** The same step, closed to the baseline, for the area wash under the line. */
export function stepAreaPath(points: SeriesPoint[], scales: Scales): string {
  const line = stepLinePath(points, scales);
  if (!line) return "";
  const baseline = scales.y(0);
  const lastX = scales.x(points[points.length - 1].t);
  const firstX = scales.x(points[0].t);
  return `${line} L ${lastX.toFixed(2)} ${baseline.toFixed(2)} L ${firstX.toFixed(2)} ${baseline.toFixed(2)} Z`;
}

/**
 * Turn dated amounts into a cumulative series.
 *
 * Events on the same day collapse to one step, and the series is sorted, so
 * the caller can pass rows straight from the database.
 */
export function cumulativeByDate(rows: { at: Date | string; amount: number }[]): SeriesPoint[] {
  const byDay = new Map<number, number>();
  for (const row of rows) {
    const date = typeof row.at === "string" ? new Date(row.at) : row.at;
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    byDay.set(day, (byDay.get(day) ?? 0) + row.amount);
  }
  let running = 0;
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, amount]) => {
      running += amount;
      return { t: day, v: running };
    });
}

/**
 * Axis ticks on round numbers (1 / 2 / 5 × a power of ten), so the reader sees
 * values they can do arithmetic with.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rough = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;

  // 2.5 belongs in the ladder: without it a maximum of 100 over four steps
  // jumps to 50 and loses the natural quarters.
  const candidates = [1, 2, 2.5, 5, 10];
  const step = (candidates.find((c) => normalised <= c) ?? 10) * magnitude;

  // Always reach past the data. Stopping below it would put the top of the
  // series above the last gridline, with nothing to read it against.
  const last = Math.ceil(max / step - 1e-9) * step;

  const ticks: number[] = [];
  for (let i = 0; i * step <= last + step * 1e-9; i++) {
    ticks.push(Number((i * step).toFixed(10)));
  }
  return ticks;
}

/** Nearest point in a series to a time, for the crosshair. */
export function nearestPoint(points: SeriesPoint[], t: number): SeriesPoint | null {
  if (!points.length) return null;
  let best = points[0];
  let bestDistance = Math.abs(points[0].t - t);
  for (const point of points) {
    const distance = Math.abs(point.t - t);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The value a step series holds at a time: the last point at or before it.
 * A crosshair must report the held value, not the nearest future one.
 */
export function valueAt(points: SeriesPoint[], t: number): number | null {
  if (!points.length) return null;
  if (t < points[0].t) return null;
  let held = points[0].v;
  for (const point of points) {
    if (point.t > t) break;
    held = point.v;
  }
  return held;
}
