// Chart palette.
//
// Derived from the OceancOS tokens (BRIDGE_ALIGNMENT_PLAN.md §7 decision 7 keeps
// the existing design system) and then SNAPPED TO PASSING against the dark chart
// surface #0a0f1c. The UI tokens themselves are too light for chart fills: on the
// dark surface `warn` sits at OKLCH L 0.769 and `ok` at 0.723, both outside the
// 0.48–0.67 band, so each hue is held and stepped down for chart use only.
//
// Every pair below was checked with the data-viz validator rather than judged by
// eye. Two findings changed the design:
//
//   1. The obvious pairing of amber `warn` with green `ok` FAILS colour-vision
//      separation at ΔE 5.7 under protanopia — a red-green colourblind reader
//      cannot reliably tell pending from accepted. Stepping green down to a deep
//      emerald clears it at ΔE 11.0.
//   2. Cyan `marine` against blue `accent` FAILS the normal-vision floor at
//      ΔE 7.9: too close even with full colour vision. Work and time progress
//      therefore use emphasis (one hue plus a recessive neutral) rather than two
//      hues, which is also the more honest form — time is the benchmark that work
//      is measured against, not a peer series.
//
// Verdicts on the dark surface #0a0f1c:
//
//   new · pending · accepted      ALL PASS   worst adjacent ΔE 11.0 protan
//   pending · accepted            ALL PASS   worst adjacent ΔE 11.0 protan
//   invoiced · paid               ALL PASS   worst adjacent ΔE 23.7 deutan
//
// Re-run after any change:
//   node scripts/validate_palette.js "#3b82f6,#d97706,#047857" --mode dark --surface "#0a0f1c"

/** The surface charts are drawn on. The validator needs this exact value. */
export const CHART_SURFACE = "#0a0f1c";

/**
 * One colour per entity, used everywhere that entity appears.
 *
 * Colour follows the entity, never its rank or position, so a filter that
 * changes which series are shown never repaints the survivors.
 */
export const SERIES = {
  /** A request the yard has not yet priced. */
  new: "#3b82f6",
  /** Quoted and awaiting the client's decision. */
  pending: "#d97706",
  /** Accepted and in progress or complete. */
  accepted: "#047857",
  /** Invoiced by the yard. */
  invoiced: "#3b82f6",
  /** Paid by the client. */
  paid: "#047857",
  /** Work done, value-weighted. The subject of the progress figure. */
  work: "#3b82f6",
} as const;

/**
 * De-emphasis. Cancelled work and elapsed time are context, not identity, so
 * they deliberately sit below the chroma floor: they must not compete with a
 * series for attention. Both always carry a visible label.
 */
export const DE_EMPHASIS = "#8294b3";

/** The unfilled part of a meter track. */
export const TRACK = "#1e2a48";

/** Grid and axis ink: one step off the surface, hairline, recessive. */
export const GRID = "#16203a";

/** Text tokens. Labels never wear the series colour. */
export const TEXT = {
  primary: "#e7ecf5",
  secondary: "#8294b3",
  muted: "#5a6b8c",
} as const;

export type SeriesKey = keyof typeof SERIES;
