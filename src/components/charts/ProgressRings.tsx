import { meterPath } from "@/lib/charts/geometry";
import { DE_EMPHASIS, SERIES, TEXT, TRACK } from "./palette";

/**
 * Two concentric meters: work done against time elapsed.
 *
 * This is emphasis, not two categorical series. Work is the subject and wears
 * the accent hue; time is the benchmark it is racing and sits in the recessive
 * neutral. That is both the honest form and the only one that passes the colour
 * checks — the two blues originally proposed were indistinguishable even with
 * full colour vision (see palette.ts).
 *
 * Either value may be null, which renders an empty track rather than a
 * misleading zero.
 */
export function ProgressRings({
  workPct,
  timePct,
  size = 180,
}: {
  workPct: number | null;
  timePct: number | null;
  size?: number;
}) {
  const radius = size / 2;
  const outerThickness = 14;
  const innerThickness = 14;
  const innerRadius = radius - outerThickness - 6;

  // Behind or ahead of the clock is the question these two rings answer.
  const delta = workPct !== null && timePct !== null ? Math.round(workPct - timePct) : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
      <svg
        width={size}
        height={size}
        viewBox={`${-radius} ${-radius} ${size} ${size}`}
        role="img"
        aria-label={
          workPct !== null && timePct !== null
            ? `Work ${Math.round(workPct)} per cent complete, time ${Math.round(timePct)} per cent elapsed`
            : "Progress not yet available"
        }
        className="shrink-0"
      >
        {/* Tracks */}
        <path d={meterPath(1, radius, outerThickness)} style={{ fill: TRACK }} />
        <path d={meterPath(1, innerRadius, innerThickness)} style={{ fill: TRACK }} />

        {/* Work — the subject */}
        {workPct !== null && (
          <path d={meterPath(workPct / 100, radius, outerThickness)} style={{ fill: SERIES.work }} />
        )}
        {/* Time — the benchmark, deliberately recessive */}
        {timePct !== null && (
          <path d={meterPath(timePct / 100, innerRadius, innerThickness)} style={{ fill: DE_EMPHASIS }} />
        )}

        <text x={0} y={2} textAnchor="middle" style={{ fill: TEXT.primary }} fontSize={size / 6} fontWeight={600}>
          {workPct === null ? "—" : `${Math.round(workPct)}%`}
        </text>
        <text x={0} y={size / 8 + 6} textAnchor="middle" style={{ fill: TEXT.muted }} fontSize={11}>
          work done
        </text>
      </svg>

      <dl className="w-full min-w-0 space-y-2.5 text-sm">
        <Row color={SERIES.work} label="Work done" value={workPct === null ? "—" : `${Math.round(workPct)}%`} />
        <Row color={DE_EMPHASIS} label="Time elapsed" value={timePct === null ? "—" : `${Math.round(timePct)}%`} />
        {delta !== null && (
          <p
            className={`pt-1 text-xs ${delta >= 0 ? "text-ok" : "text-warn"}`}
            // Direction, not just colour, carries the meaning.
          >
            {delta >= 0
              ? `${delta} points ahead of the clock`
              : `${Math.abs(delta)} points behind the clock`}
          </p>
        )}
      </dl>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      <dt className="min-w-0 flex-1 truncate text-muted">{label}</dt>
      <dd className="shrink-0 font-medium text-white tnum">{value}</dd>
    </div>
  );
}
