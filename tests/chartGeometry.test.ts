import { describe, it, expect } from "vitest";
import {
  buildScales,
  cumulativeByDate,
  donutArcs,
  foldTail,
  meterPath,
  nearestPoint,
  niceTicks,
  stepAreaPath,
  stepLinePath,
  valueAt,
  type SeriesPoint,
} from "@/lib/charts/geometry";

const box = { width: 400, height: 200, padLeft: 40, padRight: 10, padTop: 10, padBottom: 20 };

describe("foldTail", () => {
  const slices = [
    { label: "A", value: 50, color: "#1" },
    { label: "B", value: 30, color: "#2" },
    { label: "C", value: 10, color: "#3" },
    { label: "D", value: 6, color: "#4" },
    { label: "E", value: 4, color: "#5" },
  ];

  it("leaves a short list alone", () => {
    expect(foldTail(slices, 5, "#x")).toHaveLength(5);
    expect(foldTail(slices, 9, "#x")).toHaveLength(5);
  });

  it("folds the smallest into Other", () => {
    const out = foldTail(slices, 3, "#x");
    expect(out.map((s) => s.label)).toEqual(["A", "B", "C", "Other"]);
    expect(out[3].value).toBe(10);
    expect(out[3].color).toBe("#x");
  });

  it("preserves the total", () => {
    const before = slices.reduce((s, x) => s + x.value, 0);
    const after = foldTail(slices, 2, "#x").reduce((s, x) => s + x.value, 0);
    expect(after).toBe(before);
  });

  it("drops an empty tail rather than adding a zero slice", () => {
    const withZeros = [...slices.slice(0, 2), { label: "Z", value: 0, color: "#9" }];
    expect(foldTail(withZeros, 2, "#x").map((s) => s.label)).toEqual(["A", "B"]);
  });

  it("sorts by value so the kept slices are the biggest", () => {
    const shuffled = [slices[4], slices[0], slices[2]];
    expect(foldTail(shuffled, 1, "#x").map((s) => s.label)).toEqual(["A", "Other"]);
  });
});

describe("donutArcs", () => {
  const slices = [
    { label: "A", value: 1, color: "#1" },
    { label: "B", value: 1, color: "#2" },
    { label: "C", value: 2, color: "#3" },
  ];

  it("gives each slice its share of the whole", () => {
    const arcs = donutArcs(slices, { radius: 50, thickness: 10 });
    expect(arcs.map((a) => a.share)).toEqual([0.25, 0.25, 0.5]);
  });

  it("returns nothing when the total is zero", () => {
    expect(donutArcs([{ label: "A", value: 0, color: "#1" }], { radius: 50, thickness: 10 }))
      .toEqual([]);
  });

  it("skips zero-value slices but keeps their share out of the total", () => {
    const arcs = donutArcs(
      [...slices, { label: "D", value: 0, color: "#4" }],
      { radius: 50, thickness: 10 }
    );
    expect(arcs.map((a) => a.label)).toEqual(["A", "B", "C"]);
  });

  it("leaves a gap between slices rather than drawing a stroke", () => {
    const arcs = donutArcs(slices, { radius: 50, thickness: 10, gapDegrees: 4 });
    // Each slice sweeps less than its full share; the difference is the gap.
    for (const arc of arcs) {
      const swept = arc.endAngle - arc.startAngle;
      expect(swept).toBeLessThan(arc.share * Math.PI * 2);
      expect(swept).toBeGreaterThan(0);
    }
  });

  it("keeps a sliver visible when the gap would swallow it", () => {
    const arcs = donutArcs(
      [
        { label: "big", value: 999, color: "#1" },
        { label: "tiny", value: 0.01, color: "#2" },
      ],
      { radius: 50, thickness: 10, gapDegrees: 6 }
    );
    const tiny = arcs.find((a) => a.label === "tiny")!;
    expect(tiny.endAngle - tiny.startAngle).toBeGreaterThan(0);
  });

  it("emits a path for every slice", () => {
    for (const arc of donutArcs(slices, { radius: 50, thickness: 10 })) {
      expect(arc.path.startsWith("M ")).toBe(true);
      expect(arc.path.endsWith("Z")).toBe(true);
      expect(arc.path).not.toContain("NaN");
    }
  });
});

describe("meterPath", () => {
  it("is empty at zero", () => {
    expect(meterPath(0, 50, 10)).toBe("");
    expect(meterPath(-1, 50, 10)).toBe("");
  });

  it("draws a full ring at one, split so it is renderable", () => {
    const path = meterPath(1, 50, 10);
    expect(path).not.toContain("NaN");
    // A single arc cannot express 360 degrees, so it comes back as two.
    expect(path.split("M ").length - 1).toBe(2);
  });

  it("clamps above one rather than winding round", () => {
    expect(meterPath(2, 50, 10)).toBe(meterPath(1, 50, 10));
  });

  it("produces a valid path for a partial fill", () => {
    const path = meterPath(0.42, 50, 10);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).not.toContain("NaN");
  });
});

describe("buildScales", () => {
  const series: SeriesPoint[][] = [
    [
      { t: 0, v: 0 },
      { t: 10, v: 100 },
    ],
    [
      { t: 0, v: 0 },
      { t: 10, v: 50 },
    ],
  ];

  it("shares one axis across every series", () => {
    const scales = buildScales(series, box);
    expect(scales.vMax).toBe(100);
    // The smaller series is drawn on the same scale, so it sits lower.
    expect(scales.y(50)).toBeGreaterThan(scales.y(100));
  });

  it("starts the value axis at zero", () => {
    const scales = buildScales([[{ t: 0, v: 80 }, { t: 1, v: 90 }]], box);
    expect(scales.vMin).toBe(0);
  });

  it("maps the extremes to the plot edges", () => {
    const scales = buildScales(series, box);
    expect(scales.x(0)).toBeCloseTo(box.padLeft, 5);
    expect(scales.x(10)).toBeCloseTo(box.width - box.padRight, 5);
    expect(scales.y(100)).toBeCloseTo(box.padTop, 5);
    expect(scales.y(0)).toBeCloseTo(box.height - box.padBottom, 5);
  });

  it("survives a single point without dividing by zero", () => {
    const scales = buildScales([[{ t: 5, v: 5 }]], box);
    expect(Number.isFinite(scales.x(5))).toBe(true);
    expect(Number.isFinite(scales.y(5))).toBe(true);
  });

  it("survives all-zero values", () => {
    const scales = buildScales([[{ t: 0, v: 0 }, { t: 1, v: 0 }]], box);
    expect(Number.isFinite(scales.y(0))).toBe(true);
  });
});

describe("step paths", () => {
  const points: SeriesPoint[] = [
    { t: 0, v: 10 },
    { t: 5, v: 30 },
    { t: 10, v: 30 },
  ];
  const scales = buildScales([points], box);

  it("holds the previous value before stepping", () => {
    const path = stepLinePath(points, scales);
    // Two line commands per step: across at the old value, then up.
    expect(path.split("L ").length - 1).toBe(4);
    expect(path).not.toContain("NaN");
  });

  it("is empty for no points", () => {
    expect(stepLinePath([], scales)).toBe("");
    expect(stepAreaPath([], scales)).toBe("");
  });

  it("closes the area to the baseline", () => {
    const path = stepAreaPath(points, scales);
    expect(path.endsWith("Z")).toBe(true);
    expect(path).toContain(scales.y(0).toFixed(2));
  });
});

describe("cumulativeByDate", () => {
  it("accumulates in date order", () => {
    const out = cumulativeByDate([
      { at: "2026-03-03T10:00:00Z", amount: 30 },
      { at: "2026-03-01T10:00:00Z", amount: 10 },
      { at: "2026-03-02T10:00:00Z", amount: 20 },
    ]);
    expect(out.map((p) => p.v)).toEqual([10, 30, 60]);
  });

  it("collapses several events on one day into a single step", () => {
    const out = cumulativeByDate([
      { at: "2026-03-01T08:00:00Z", amount: 10 },
      { at: "2026-03-01T18:00:00Z", amount: 5 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].v).toBe(15);
  });

  it("handles an empty list", () => {
    expect(cumulativeByDate([])).toEqual([]);
  });

  it("accepts Date objects as well as strings", () => {
    const out = cumulativeByDate([{ at: new Date("2026-03-01T00:00:00Z"), amount: 7 }]);
    expect(out[0].v).toBe(7);
  });
});

describe("niceTicks", () => {
  it("returns round numbers", () => {
    expect(niceTicks(100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(1000, 4)).toEqual([0, 250, 500, 750, 1000]);
  });

  it("always starts at zero and reaches the maximum", () => {
    for (const max of [7, 43, 912, 1_234_567]) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });

  it("degrades safely on a zero or invalid maximum", () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(NaN)).toEqual([0]);
    expect(niceTicks(-5)).toEqual([0]);
  });
});

describe("reading a series at a time", () => {
  const points: SeriesPoint[] = [
    { t: 10, v: 100 },
    { t: 20, v: 300 },
  ];

  it("holds the last value rather than interpolating", () => {
    expect(valueAt(points, 10)).toBe(100);
    expect(valueAt(points, 15)).toBe(100);
    expect(valueAt(points, 20)).toBe(300);
    expect(valueAt(points, 99)).toBe(300);
  });

  it("reports nothing before the series starts", () => {
    expect(valueAt(points, 5)).toBeNull();
    expect(valueAt([], 5)).toBeNull();
  });

  it("finds the nearest point for the crosshair", () => {
    expect(nearestPoint(points, 11)?.t).toBe(10);
    expect(nearestPoint(points, 19)?.t).toBe(20);
    expect(nearestPoint([], 1)).toBeNull();
  });
});
