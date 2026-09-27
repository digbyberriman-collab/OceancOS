// Where register rows belong, beyond one-row-one-project.
//
// Three kinds of decision, each made here, by hand, where it can be reviewed:
//
//   Merges     A row that is part of another period rather than a yard visit
//              of its own. Its source, scope and contractor become the other
//              period's; it gets no project. The register records Proyacht's
//              1,420 hours on Draak as a separate row, but they were worked
//              inside the 2023–26 rebuild, so the vessel has two periods in
//              this application where the register has three rows.
//   Conflicts  Evidence & Conflicts rows. One about a period is a CONFLICT on
//              that period's project; one about a claim the register left
//              out (build-phase work, a weak report) is EXCLUDED, kept at
//              vessel level so nobody adds the claim back unknowingly.
//   Gaps       Data Gaps rows about one period are pinned to its project.
//
// Rows are named by import key (yard|start|end|type) for periods and by
// yard|issue for conflicts and gaps. A test checks every name resolves.

export type Merge = { from: string; into: string; reason: string };

export const MERGES: Merge[] = [
  {
    from: "Y709|2023|2026|Contractor work package within rebuild",
    into: "Y709|2023-06 approx.|2026-06|Comprehensive rebuild / role conversion",
    reason:
      "The register lists Proyacht's 1,420 hours on Y709 as a row of its own; they were worked inside the 2023–26 " +
      "rebuild, so they are recorded as part of it rather than as a separate yard period.",
  },
];

/** The period an Evidence & Conflicts row is about, or null for an excluded claim. */
export const CONFLICT_TARGETS: Record<string, string | null> = {
  "Y701|Proyacht yard-number mismatch": "Y701|2025|2025|Refit / outfitting",
  "Y709|Refit duration wording":
    "Y709|2023-06 approx.|2026-06|Comprehensive rebuild / role conversion",
  "Y711|Orams dates unavailable": "Y711|Date unverified|Date unverified|Maintenance & upgrades",
  "Y721|Weak 2023 La Ciotat claim": null,
  "Y720|New-build vs refit": null,
  "Y722|New-build vs refit": null,
  "Y726|New-build / warranty ambiguity": null,
};

/** Data Gaps rows about one period, and that period. Every other gap is the vessel's (or the fleet's). */
export const GAP_TARGETS: Record<string, string> = {
  "Y701|Resolve Proyacht Y709 label conflict for 2025 Batello entry.":
    "Y701|2025|2025|Refit / outfitting",
  "Y709|Public total rebuild cost not disclosed.":
    "Y709|2023-06 approx.|2026-06|Comprehensive rebuild / role conversion",
  "Y714|Public total refit cost not disclosed.":
    "Y714|2019-03|2020-11|Major transformational refit",
};
