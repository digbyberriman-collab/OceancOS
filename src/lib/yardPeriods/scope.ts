// A yard period's scope of work, by discipline.
//
// The register's Detailed Scope sheet splits each period's Scope into
// disciplines by keyword, and gets it wrong: KAOS's "Largest Lürssen refit at
// the time" lands under Electrical/AV-IT, Draak's clauses are repeated under
// three disciplines, and Draak's helideck removal and added capacity are not
// there at all. So the split is done here instead, from the master sheet's
// Scope, by hand, and committed where it can be reviewed.
//
// Each entry names an exact piece of a period's published Scope and what it
// is: a discipline, or NARRATIVE — context that is not itself work
// ("Navantia lists the yacht among…", "About 150 people worked…",
// "scope not publicly disclosed"). Narrative stays in the scope summary,
// which is always shown in full; only disciplined clauses become scope lines.
// The text is never reworded. A test holds every period's Scope to its
// entries: each entry appears in it once, in order, and nothing but
// separators is left over, so a clause cannot be dropped, repeated or
// invented.
//
// When a later edition changes a period's Scope, its entries stop matching
// and the test fails: review the new text and update the entries here. A
// period with no entries is imported without scope lines, with a warning.

import type { ScopeDiscipline } from "../enums";

export type ScopeClass = ScopeDiscipline | "NARRATIVE";

const S = "STRUCTURE_HULL_PAINT";
const M = "MECHANICAL_PROPULSION";
const E = "ELECTRICAL_AVIT_NAV";
const I = "INTERIOR_GUEST";
const D = "DECK_TENDER_MISSION";
const C = "SURVEY_CLASS_COMPLIANCE";
const G = "GENERAL";
const N = "NARRATIVE";

export type ScopeEntry = [text: string, cls: ScopeClass];

/** Every period's Scope, clause by clause, keyed by the period's import key. */
export const SCOPE_CLASSIFICATION: Record<string, ScopeEntry[]> = {
  "Y701|2012-Q2|2012-Q2|Dry-dock / maintenance": [
    ["Lifted on Syncrolift", S],
    ["stabiliser servicing", M],
  ],
  "Y701|2019|2019|Repair / maintenance": [
    ["Navantia lists AMEVI among 2019 megayacht repair projects", N],
    ["detailed work scope not publicly disclosed", N],
  ],
  "Y701|2021|2021|Refit": [
    ["A 2024 industry summary reports refits in 2019, 2021, 2022 and 2024", N],
    ["2021 yard and scope not identified in sources reviewed", N],
  ],
  "Y701|2022|2022|Refit": [
    ["Multiple yacht databases report a 2022 refit", N],
    ["public detail on yard and scope was not located", N],
  ],
  "Y701|2024|2024|Refit": [
    ["Market material identifies a 2024 refit before Monaco Yacht Show / sale campaign", N],
    ["scope not publicly detailed", N],
  ],
  "Y701|2025|2025|Refit / outfitting": [
    ["Post-sale refit", N],
    [
      "Proyacht records 143 hours covering outfitting, safety plan, construction work and storage plan",
      G,
    ],
    ["Oceanco later described charter-ready play features introduced in the 2025 refit", I],
  ],
  "Y702|2024|2024|Comprehensive mechanical & cosmetic refit": [
    ["Propellers removed/polished", M],
    ["shaft-line seals replaced", M],
    ["steering gear serviced", M],
    ["hull valves overhauled", M],
    ["hydraulic tender-garage/boarding systems recalibrated", D],
    ["antifouling/anodes renewed", S],
    ["black hull repainted", S],
    ["deck hardware repairs", D],
    ["water heater, HVAC cleaning, glass elevator service", M],
    ["soft furnishings, beach club/gym equipment, chase boat and toys refreshed", I],
  ],
  "Y702|2024|2026|Follow-on service / support": [
    ["Proyacht records 389 hours since 2024 across Oceanco, St. Maarten and La Ciotat", G],
    ["Scope not itemised", N],
  ],
  "Y703|2022|2022|Extensive refit": [
    [
      "Charter sources describe an extensive 2022 refit bringing systems and interior up to current standard",
      N,
    ],
    ["newly designed main and upper saloons are reported", I],
  ],
  "Y703|2023-Q4|2024|Major refit / emissions upgrade": [
    ["Full superstructure repaint", S],
    ["new sundeck construction", S],
    ["new sunroof, Jacuzzi and custom sunbathing furniture", I],
    ["DPF filtration system installed on main engines to reduce emissions", M],
  ],
  "Y704|2018|2018|Repair / maintenance": [
    ["Navantia lists the yacht among megayacht repair projects for this year", N],
    ["individual work list not publicly disclosed", N],
  ],
  "Y704|2020|2020|Repair / maintenance": [
    ["Navantia lists the yacht among megayacht repair projects for this year", N],
    ["individual work list not publicly disclosed", N],
  ],
  "Y704|2021|2021|Repair / maintenance": [
    ["Navantia lists the yacht among megayacht repair projects for this year", N],
    ["individual work list not publicly disclosed", N],
  ],
  "Y704|2022|2022|Repair / maintenance": [
    ["Navantia lists the yacht among megayacht repair projects for this year", N],
    ["individual work list not publicly disclosed", N],
  ],
  "Y704|2023|2023|Repair / maintenance": [
    ["Navantia lists the yacht among megayacht repair projects for this year", N],
    ["individual work list not publicly disclosed", N],
  ],
  "Y704|2019|2019|Dry-dock / maintenance": [
    ["Dry-docked for stabiliser service", M],
    ["Navantia also lists the yacht among its 2019 repair projects", N],
  ],
  "Y705|2017-Spring|2017-Spring|Annual refit": [
    ["Main-engine work", M],
    ["generator service", M],
    ["paint repairs", S],
    ["antifouling", S],
    ["stabiliser service and associated annual works", M],
  ],
  "Y705|2018-Spring|2018-Spring|Large annual refit": [
    ["General interior, exterior and engine works", G],
    ["multiple charter-focused upgrades", G],
    ["Navantia independently lists SUNRAYS among 2018 projects", N],
  ],
  "Y705|2019|2019|Repair / maintenance": [
    ["Navantia lists SUNRAYS among 2019 megayacht repair projects", N],
    ["detailed work list not public", N],
  ],
  "Y705|2020|2020|10-year refit / class-cycle maintenance": [
    ["Major 10-year refit involving hull, valves, tanks, engines and auxiliaries, systems", C],
    ["aesthetic and owner-improvement works", I],
  ],
  "Y705|2021|2021|Repair / maintenance": [
    ["Navantia lists SUNRAYS again among 2021 repair projects", N],
    ["scope not public", N],
  ],
  "Y705|2026|2026|Refit": [
    ["Returned to charter market following a 2026 refit", N],
    ["public sources reviewed confirm the refit but not yard or detailed scope", N],
  ],
  "Y706|2013-09|2013-12|Refit / repaint": [
    ["Three-month refit", N],
    ["Awlgrip blue hull topsides respray and various maintenance jobs", S],
    ["Managed with Oceanco after-sales and Wright Maritime Group", N],
    ["finish reported three days ahead of schedule", N],
  ],
  "Y706|2021|2021|Interior refit": [
    [
      "Genesis Interiors records an 86m Seven Seas refit/interior project in the USA with Nuvolari & Lenard",
      I,
    ],
  ],
  "Y706|2022-Winter|2023|Technical / cosmetic refit": [
    ["Paint", S],
    ["brighter exterior colours", S],
    ["new exterior cushions/fabrics", I],
    ["full bridge electronics upgrade", E],
    ["Starlink + 5G integration", E],
    ["floors redone", I],
    ["marble polished", I],
    ["tenders repainted/reupholstered with dashboard work", D],
    ["AC tuning/upgrades", M],
  ],
  "Y706|2024|2024|Interior / owner works": [
    [
      "Genesis Interiors records an 86m Man of Steel project in Italy in 2024, designer listed as Owner",
      I,
    ],
    ["exact work list not public", N],
  ],
  "Y707|2017|2017|Refit": [
    [
      "Technical Marine UK records MY Nirvana as a refit/operational project at Oceanco/Refit CW",
      N,
    ],
    ["bluleu separately records a 2017 lighting refit on Y707", E],
    ["Full scope and dates are not public", N],
  ],
  "Y708|2022|2022|Refit": [
    ["Brillouet's project reference lists M/Y Amore Vero (Oceanco, 289ft) as a 2022 refit", N],
    ["Public source does not identify the principal yard or work package", N],
  ],
  "Y709|2017|2017|Refit / lighting works": [
    ["bluleu records a 2017 refit on Equanimity / Tranquility Y709", N],
    ["public page establishes contractor involvement but not full project scope or yard", N],
  ],
  "Y709|2023-06 approx.|2026-06|Comprehensive rebuild / role conversion": [
    ["Converted from luxury superyacht into expedition/support companion for Leviathan", N],
    ["Upper-deck aft helideck removed", S],
    ["heavy-duty tender deck and 12.6t jib crane added", D],
    ["boarding platform extended, increasing LOA by ~1m", S],
    ["former beach club/spa converted to dive centre with decompression chamber", D],
    ["main saloon converted to large crew mess and chef's lab", I],
    ["added crew/staff/guest capacity", I],
    ["major structural, layout, electrical and AV/IT changes", G],
    ["more than 58km of cabling replaced", E],
    ["dedicated dive tender and heavy lifting capability", D],
  ],
  "Y709|2023|2026|Contractor work package within rebuild": [
    ["Proyacht records 1,420 hours of outfit and construction work on Y709 since 2023", G],
  ],
  "Y710|2019|2019|Repair / maintenance": [
    ["Navantia lists INFINITY among 2019 megayacht repair projects", N],
    ["bluleu separately records a 2019 refit on Infinity Y710, supporting the identification", N],
  ],
  "Y710|2022|2022|Interior refit": [
    ["Interior design updated by Vickers Studio during a refit at MB92 Barcelona", I],
  ],
  "Y710|2024-10|2025-Q1 approx.|Refit": [
    ["Returned to the Netherlands in October 2024 for an Oceanco refit", N],
    ["details kept tightly under wraps", N],
    ["Reported seen in Rotterdam following completion in early 2025", N],
  ],
  "Y711|2020 approx.|2021 approx.|Five-year survey / refit": [
    ["Vitters rented a large Royal T Shipyards hall for AQuiJo's five-year survey", C],
    [
      "Contemporary technical reporting notes application of a new non-toxic, high-gloss bottom paint during the five-year refit",
      S,
    ],
  ],
  "Y711|Date unverified|Date unverified|Maintenance & upgrades": [
    [
      "Orams Marine quotes AQuiJo's captain stating the yacht spent eight months at the yard completing a variety of maintenance and upgrade projects",
      G,
    ],
    ["Exact dates and itemised scope were not established from the public page", N],
  ],
  "Y712|2019 approx.|2019 approx.|Dry-dock / maintenance": [
    ["Dry-docked to replace stern-tube seals", M],
    ["wash/paint the hull bottom", S],
  ],
  "Y712|2024|2024|Refit": [
    [
      "Public yacht data records 2024 as the last refit year, but detailed yard, dates and scope were not located in the sources reviewed",
      N,
    ],
  ],
  "Y714|2019-03|2020-11|Major transformational refit": [
    ["Largest Lürssen refit at the time", N],
    ["Exterior modifications to main-deck and bridge-deck aft", S],
    ["new transom/aft arrangements", S],
    ["approximately 1,500m² of interior renewed and reconfigured", I],
    ["new and existing interior spaces redesigned", I],
    ["About 150 people worked simultaneously at peak", N],
  ],
  "Y715|2025|2025|Refit": [
    ["Y.CO lists Barbara as refitted in 2025", N],
    [
      "Publicly accessible detail on yard, dates and scope was not located in this research pass",
      N,
    ],
  ],
  "Y717|2024|2024|Refit": [
    ["Multiple market sources record a 2024 refit", N],
    ["Detailed yard, dates and work list were not established from the public sources reviewed", N],
  ],
  "Y718|2021-08|2021-08|Service / upgrade": [
    ["Proyacht records replacement of bow strip lights", E],
    ["polishing of the anchor pocket", S],
  ],
  "Y718|2022|2022|Repair / maintenance": [
    ["Navantia lists BRAVO EUGENIA among 2022 megayacht repair projects", N],
    ["detailed scope not public", N],
  ],
  "Y718|2023|2023|Repair / upgrade": [
    ["Navantia lists BRAVO EUGENIA among significant 2023 repair and upgrade projects", N],
    ["detailed yacht-specific work list not public", N],
  ],
  "Y719|2023-06|2023-07|Post-delivery outfitting / works": [
    [
      "Proyacht records 1,545 hours of outfit work and 'calcing' work on Y719 Infinity in Pula from June to July 2023",
      G,
    ],
  ],
};

/**
 * What may be left of a Scope once every entry is taken out: whitespace, the
 * clause separators the register uses, and the joining words between two
 * clauses of different disciplines ("… stern-tube seals and wash/paint …").
 */
const SEPARATORS = /^(?:[\s;,.]|\band\b|\bplus\b)*$/i;

export type ScopeCheck = { ok: true } | { ok: false; problem: string };

/** Whether `entries` account for every word of `scope`, once each and in order. */
export function checkScopeCoverage(scope: string, entries: ScopeEntry[]): ScopeCheck {
  let rest = "";
  let at = 0;
  for (const [text] of entries) {
    const found = scope.indexOf(text, at);
    if (found === -1) {
      return {
        ok: false,
        problem: `"${text}" is not in the scope (or not after the previous entry)`,
      };
    }
    if (scope.indexOf(text, found + text.length) !== -1) {
      return { ok: false, problem: `"${text}" appears more than once` };
    }
    rest += scope.slice(at, found);
    at = found + text.length;
  }
  rest += scope.slice(at);
  if (!SEPARATORS.test(rest)) {
    return { ok: false, problem: `left unaccounted for: ${JSON.stringify(rest.trim())}` };
  }
  return { ok: true };
}

/** A clause as a scope line: first letter capitalised, no trailing full stop. */
export function scopeLine(text: string): string {
  const t = text.trim().replace(/\.$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type ScopeLine = { discipline: ScopeDiscipline; description: string };

/** The scope lines of a period, in published order, from its entries. */
export function scopeLines(entries: ScopeEntry[] | undefined): ScopeLine[] {
  return (entries ?? [])
    .filter((e): e is [string, ScopeDiscipline] => e[1] !== N)
    .map(([text, discipline]) => ({ discipline, description: scopeLine(text) }));
}
