// Loading the yard-period register into the database.
//
// Every period in the register becomes a COMPLETED project on its vessel,
// with a YardPeriodRecord holding what was published, its scope by
// discipline (scope.ts) and the evidence behind it; the register's gaps
// become data gaps. Vessels are matched by yard number only — names collide
// across hulls (Man of Steel was Seven Seas; Y720 is Seven Seas) — and a
// period whose vessel is not in the database stops the import: the vessel
// register decides which vessels exist.
//
// Like the vessel register's loader, re-running it never takes anything away
// or undoes an edit. A period is found again by its import key; a record
// only has blanks filled unless asked to overwrite; scope lines, evidence,
// gaps and observations are only ever added, deduplicated by fingerprint.
// Nothing here writes a budget, a job or any figure that is summed as money:
// the cost bands are planning estimates and stay on the record.
//
// The work is split in two: planYardPeriods() decides everything from the
// workbook alone and is unit-tested; importYardPeriods() applies a plan.

import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ConfidenceLevel, ScopeDiscipline, YardEvidenceKind } from "../enums";
import { isNoValueText } from "../vessels/fields";
import { freeProjectCode, gapFingerprint, observationFingerprint } from "../vessels/importRegister";
import { parseCostBand } from "./cost";
import { CONFLICT_TARGETS, GAP_TARGETS, MERGES } from "./merges";
import { formatPeriod, periodBounds, startYear } from "./period";
import { SCOPE_CLASSIFICATION, scopeLines } from "./scope";
import { periodKey, type RegisterPeriod, type YardPeriodRegister } from "./workbook";

export { periodKey };

/** The data-gap scope every yard-history gap is filed under. */
export const YARD_HISTORY_SCOPE = "Yard history";

function fingerprint(parts: (string | null | undefined)[]): string {
  return createHash("sha256")
    .update(["yard", ...parts].map((p) => p ?? "").join("␟"))
    .digest("hex");
}

/**
 * A place the register actually identifies, or null. "Unverified" and
 * "Unspecified USA yard" say the source did not name one; so does a bare
 * "Multiple" (the list of places is in the yard column).
 */
export function identifiedPlace(text: string | null): string | null {
  const t = (text ?? "").trim();
  if (!t || isNoValueText(t) || /^unspecified\b/i.test(t) || /^multiple$/i.test(t)) return null;
  return t;
}

/** "https://www.Example.com/a/" and "https://example.com/a" are one source. */
export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function splitList(text: string | null): string[] {
  return (text ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- The plan ----------

export type PlannedEvidence = {
  kind: YardEvidenceKind;
  yardNumber: string;
  /** The period it belongs to; null for vessel-level evidence. */
  importKey: string | null;
  sourceUrl: string | null;
  sourceQuality: string | null;
  confidence: ConfidenceLevel | null;
  issue: string | null;
  qualification: string | null;
};

export type PlannedRecord = {
  nameAtPeriod: string | null;
  periodType: string;
  startLabel: string;
  endLabel: string;
  precisionLabel: string | null;
  approximate: boolean;
  sortStart: Date | null;
  sortEnd: Date | null;
  yardText: string | null;
  cityText: string | null;
  countryText: string | null;
  scopeSummary: string | null;
  contractorsText: string | null;
  reportedCostText: string | null;
  costBandLabel: string | null;
  costBandLow: Prisma.Decimal | null;
  costBandHigh: Prisma.Decimal | null;
  costBandOpenEnded: boolean;
  costBandCurrency: string | null;
  costBandBasis: string | null;
  confidence: ConfidenceLevel | null;
  notes: string | null;
  registerEdition: string | null;
};

export type PlannedPeriod = {
  importKey: string;
  rowNumber: number;
  yardNumber: string;
  /** The project code before any clash with codes already in use. */
  codeBase: string;
  name: string;
  type: "REFIT" | "CONVERSION";
  /** Only a yard the register identifies; "Unverified" leaves it blank. */
  yardName: string | null;
  record: PlannedRecord;
  scope: { discipline: ScopeDiscipline; description: string }[];
  evidence: PlannedEvidence[];
  /** Import keys of rows merged into this one (merges.ts). */
  mergedFrom: string[];
};

export type PlannedGap = {
  yardNumber: string | null;
  importKey: string | null;
  priority: string;
  issue: string;
  evidenceNeeded: string | null;
  status: string;
};

export type YardPeriodPlan = {
  periods: PlannedPeriod[];
  /** Evidence about a vessel rather than one period: excluded claims. */
  vesselEvidence: PlannedEvidence[];
  gaps: PlannedGap[];
  warnings: string[];
};

function planRecord(row: RegisterPeriod, edition: string | null): PlannedRecord {
  const { sortStart, sortEnd, approximate } = periodBounds(row.startLabel, row.endLabel);
  const band = parseCostBand(row.costBand);
  return {
    nameAtPeriod: row.nameAtPeriod,
    periodType: row.periodType,
    startLabel: row.startLabel,
    endLabel: row.endLabel,
    precisionLabel: row.precisionLabel,
    approximate,
    sortStart,
    sortEnd,
    yardText: row.yard,
    cityText: row.city,
    countryText: row.country,
    scopeSummary: row.scope,
    contractorsText: row.contractors,
    reportedCostText: row.reportedCost,
    costBandLabel: band?.label ?? null,
    costBandLow: band?.low ?? null,
    costBandHigh: band?.high ?? null,
    costBandOpenEnded: band?.openEnded ?? false,
    costBandCurrency: band?.currency ?? null,
    costBandBasis: row.estimateBasis,
    confidence: row.confidence,
    notes: row.notes,
    registerEdition: edition,
  };
}

/** Decide every project, record, scope line, piece of evidence and gap from the workbook alone. */
export function planYardPeriods(register: YardPeriodRegister): YardPeriodPlan {
  const warnings: string[] = [];
  const mergeFrom = new Map(MERGES.map((m) => [m.from, m]));
  const byKey = new Map<string, PlannedPeriod>();
  const periods: PlannedPeriod[] = [];
  const seen = new Set<string>();

  for (const row of register.periods) {
    const importKey = periodKey(row);
    if (seen.has(importKey)) {
      throw new Error(
        `Yard-period register: row ${row.rowNumber} repeats the period ${importKey}.`,
      );
    }
    seen.add(importKey);
    if (mergeFrom.has(importKey)) continue;

    const entries = SCOPE_CLASSIFICATION[importKey];
    if (!entries && row.scope) {
      warnings.push(
        `Row ${row.rowNumber} (${importKey}) has no scope classification; imported without scope lines.`,
      );
    }
    const year = startYear(row.startLabel);
    const planned: PlannedPeriod = {
      importKey,
      rowNumber: row.rowNumber,
      yardNumber: row.yardNumber,
      codeBase: `${row.yardNumber}-${year ?? "UNDATED"}`,
      name: row.periodType,
      type: /conversion/i.test(row.periodType) ? "CONVERSION" : "REFIT",
      yardName: identifiedPlace(row.yard),
      record: planRecord(row, register.edition),
      scope: scopeLines(entries),
      evidence: [
        {
          kind: "SOURCE",
          yardNumber: row.yardNumber,
          importKey,
          sourceUrl: row.sourceUrl,
          sourceQuality: row.sourceQuality,
          confidence: row.confidence,
          issue: null,
          qualification: null,
        },
      ],
      mergedFrom: [],
    };
    periods.push(planned);
    byKey.set(importKey, planned);
  }

  for (const merge of MERGES) {
    const row = register.periods.find((r) => periodKey(r) === merge.from);
    if (!row) {
      warnings.push(`The merge of ${merge.from} names a row this edition does not have.`);
      continue;
    }
    const into = byKey.get(merge.into);
    if (!into)
      throw new Error(
        `Yard-period register: ${merge.from} merges into ${merge.into}, which is not in it.`,
      );
    into.mergedFrom.push(merge.from);
    into.scope.push(...scopeLines(SCOPE_CLASSIFICATION[merge.from]));
    into.evidence.push({
      kind: "SOURCE",
      yardNumber: row.yardNumber,
      importKey: into.importKey,
      sourceUrl: row.sourceUrl,
      sourceQuality: row.sourceQuality,
      confidence: row.confidence,
      issue: null,
      qualification: `${row.scope ?? row.periodType} ${merge.reason}`,
    });
    const contractors = splitList(into.record.contractorsText);
    for (const c of splitList(row.contractors)) if (!contractors.includes(c)) contractors.push(c);
    into.record.contractorsText = contractors.length ? contractors.join("; ") : null;
  }

  const vesselEvidence: PlannedEvidence[] = [];
  for (const c of register.conflicts) {
    const key = `${c.yardNumber}|${c.issue}`;
    const target = CONFLICT_TARGETS[key];
    if (target === undefined) {
      warnings.push(
        `Conflict "${key}" is not attributed in merges.ts; kept as a conflict on the vessel.`,
      );
    }
    if (typeof target === "string" && !byKey.has(target)) {
      throw new Error(
        `Yard-period register: conflict "${key}" is about ${target}, which is not in it.`,
      );
    }
    const evidence: PlannedEvidence = {
      kind: target === null ? "EXCLUDED" : "CONFLICT",
      yardNumber: c.yardNumber,
      importKey: typeof target === "string" ? target : null,
      sourceUrl: c.sourceUrl,
      sourceQuality: null,
      confidence: c.confidence,
      issue: c.issue,
      qualification: c.treatment,
    };
    if (typeof target === "string") byKey.get(target)!.evidence.push(evidence);
    else vesselEvidence.push(evidence);
  }

  const gaps: PlannedGap[] = register.gaps.map((g) => {
    const target = GAP_TARGETS[`${g.yardNumber}|${g.gap}`] ?? null;
    if (target && !byKey.has(target)) {
      throw new Error(
        `Yard-period register: gap "${g.gap}" is about ${target}, which is not in it.`,
      );
    }
    return {
      yardNumber: /^all$/i.test(g.yardNumber) ? null : g.yardNumber,
      importKey: target,
      priority: g.priority,
      issue: g.gap,
      evidenceNeeded: g.verificationRoute,
      status: g.status,
    };
  });

  return { periods, vesselEvidence, gaps, warnings };
}

/** The codes a fresh database would give the planned periods, in order. */
export function plannedCodes(periods: Pick<PlannedPeriod, "codeBase">[]): string[] {
  const used = new Set<string>();
  return periods.map((p) => {
    let code = p.codeBase;
    for (let n = 2; used.has(code); n++) code = `${p.codeBase}-${n}`;
    used.add(code);
    return code;
  });
}

/** Refits and rebuilds count towards a vessel's latest refit; repairs, surveys and service calls do not. */
const REFIT_TYPE = /refit|rebuild|conversion/i;

export type LatestRefit = {
  year: number;
  importKey: string;
  approximate: boolean;
  sourceUrl: string | null;
};

/** Each vessel's most recent refit or rebuild in the plan, by when it ended. */
export function latestRefits(periods: PlannedPeriod[]): Map<string, LatestRefit> {
  const latest = new Map<string, { at: number; refit: LatestRefit }>();
  for (const p of periods) {
    if (!REFIT_TYPE.test(p.record.periodType) || !p.record.sortEnd) continue;
    const at = p.record.sortEnd.getTime();
    const seen = latest.get(p.yardNumber);
    if (seen && seen.at > at) continue;
    latest.set(p.yardNumber, {
      at,
      refit: {
        year: p.record.sortEnd.getUTCFullYear(),
        importKey: p.importKey,
        approximate: p.record.approximate,
        sourceUrl: p.evidence.find((e) => e.kind === "SOURCE")?.sourceUrl ?? null,
      },
    });
  }
  return new Map([...latest].map(([yard, { refit }]) => [yard, refit]));
}

// ---------- Applying it ----------

export type YardImportSummary = {
  projectsCreated: number;
  recordsFilled: number;
  scopeLinesAdded: number;
  evidenceAdded: number;
  sourcesCreated: number;
  gapsAdded: number;
  observationsAdded: number;
  refitYearsFilled: number;
};

export type YardImportResult = { summary: YardImportSummary; warnings: string[] };

export type YardImportOptions = {
  /** Replace record values already held with the workbook's. Off by default. */
  overwrite?: boolean;
  actorId?: string | null;
  /** Work out what would change, then roll it all back. */
  check?: boolean;
};

export function isNoChange(summary: YardImportSummary): boolean {
  return Object.values(summary).every((n) => n === 0);
}

class RollBack extends Error {
  constructor(readonly result: YardImportResult) {
    super("rolled back");
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a != null && b != null && typeof a === "object" && typeof b === "object" && "equals" in a) {
    return (a as Prisma.Decimal).equals(b as Prisma.Decimal);
  }
  return (a ?? null) === (b ?? null);
}

function isEmpty(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function importYardPeriods(
  prisma: PrismaClient,
  register: YardPeriodRegister,
  options: YardImportOptions = {},
): Promise<YardImportResult> {
  const plan = planYardPeriods(register);
  const warnings = [...plan.warnings];
  const summary: YardImportSummary = {
    projectsCreated: 0,
    recordsFilled: 0,
    scopeLinesAdded: 0,
    evidenceAdded: 0,
    sourcesCreated: 0,
    gapsAdded: 0,
    observationsAdded: 0,
    refitYearsFilled: 0,
  };
  const editionDate = register.edition ? new Date(`${register.edition}T00:00:00.000Z`) : null;

  try {
    await prisma.$transaction(
      async (tx) => {
        // Vessels, by yard number.
        const yardNumbers = [
          ...new Set([
            ...plan.periods.map((p) => p.yardNumber),
            ...plan.vesselEvidence.map((e) => e.yardNumber),
            ...plan.gaps.map((g) => g.yardNumber).filter((y): y is string => !!y),
          ]),
        ];
        const vessels = await tx.vessel.findMany({
          where: { yardNumber: { in: yardNumbers } },
          select: {
            id: true,
            yardNumber: true,
            name: true,
            imo: true,
            deliveredYear: true,
            loa: true,
            lastRefitYear: true,
          },
        });
        const vesselByYard = new Map(vessels.map((v) => [v.yardNumber!, v]));
        const missing = yardNumbers.filter((y) => !vesselByYard.has(y));
        if (missing.length) {
          throw new Error(
            `Yard-period register: ${missing.join(", ")} not in the database. Load the vessel register first ` +
              "(npm run vessels:import); vessels are matched by yard number only.",
          );
        }
        for (const s of register.summary) {
          const v = vesselByYard.get(s.yardNumber);
          if (!v) continue;
          if (v.name.toLowerCase() !== s.currentVessel.toLowerCase()) {
            warnings.push(
              `${s.yardNumber} is "${v.name}" here and "${s.currentVessel}" in the register.`,
            );
          }
          if (
            s.deliveredYear != null &&
            v.deliveredYear != null &&
            s.deliveredYear !== v.deliveredYear
          ) {
            warnings.push(
              `${s.yardNumber} delivered ${v.deliveredYear} here, ${s.deliveredYear} in the register.`,
            );
          }
          if (s.loa != null && v.loa != null && Math.abs(s.loa - v.loa) > 0.05) {
            warnings.push(`${s.yardNumber} LOA ${v.loa} m here, ${s.loa} m in the register.`);
          }
        }

        // Sources: matched by URL; new ones take the next free RF code.
        const known = await tx.vesselSource.findMany({
          select: { id: true, code: true, url: true },
        });
        const sourceByUrl = new Map<string, { id: string; code: string }>();
        for (const s of known)
          if (s.url) sourceByUrl.set(normaliseUrl(s.url), { id: s.id, code: s.code });
        let nextRf =
          Math.max(
            0,
            ...known
              .map((s) => /^RF(\d+)$/.exec(s.code))
              .filter(Boolean)
              .map((m) => Number(m![1])),
          ) + 1;
        const qualityByUrl = new Map(register.sources.map((s) => [normaliseUrl(s.url), s.quality]));
        const wanted = [
          ...register.sources.map((s) => s.url),
          ...plan.periods.flatMap((p) => p.evidence.map((e) => e.sourceUrl)),
          ...plan.vesselEvidence.map((e) => e.sourceUrl),
        ].filter((u): u is string => !!u);
        for (const url of wanted) {
          const key = normaliseUrl(url);
          if (sourceByUrl.has(key)) continue;
          const code = `RF${String(nextRf++).padStart(2, "0")}`;
          const created = await tx.vesselSource.create({
            data: {
              code,
              publisher: hostOf(url),
              sourceType: qualityByUrl.get(key) ?? null,
              scope: "Yard-period register",
              url,
              accessedOn: editionDate,
            },
          });
          sourceByUrl.set(key, { id: created.id, code });
          summary.sourcesCreated++;
        }
        const sourceId = (url: string | null) =>
          url ? (sourceByUrl.get(normaliseUrl(url))?.id ?? null) : null;

        // Periods.
        const projectIdByKey = new Map<string, string>();
        for (const p of plan.periods) {
          const vessel = vesselByYard.get(p.yardNumber)!;
          const existing = await tx.yardPeriodRecord.findUnique({
            where: { importKey: p.importKey },
            select: { id: true, projectId: true, project: { select: { yardName: true } } },
          });
          if (!existing) {
            const project = await tx.project.create({
              data: {
                vesselId: vessel.id,
                name: p.name,
                code: await freeProjectCode(tx, p.codeBase),
                type: p.type,
                status: "COMPLETED",
                yardName: p.yardName,
                currency: "EUR",
                yardPeriod: { create: { importKey: p.importKey, origin: "IMPORT", ...p.record } },
              },
              select: { id: true },
            });
            projectIdByKey.set(p.importKey, project.id);
            summary.projectsCreated++;
            continue;
          }

          projectIdByKey.set(p.importKey, existing.projectId);
          const held = await tx.yardPeriodRecord.findUniqueOrThrow({ where: { id: existing.id } });
          const changes: Record<string, unknown> = {};
          for (const [k, value] of Object.entries(p.record) as [keyof PlannedRecord, unknown][]) {
            if (value == null || (typeof value === "string" && !value.trim())) continue;
            const current = held[k];
            if (sameValue(current, value)) continue;
            if (options.overwrite || isEmpty(current)) changes[k] = value;
          }
          if (Object.keys(changes).length) {
            await tx.yardPeriodRecord.update({ where: { id: existing.id }, data: changes });
            summary.recordsFilled += Object.keys(changes).length;
          }
          if (
            p.yardName &&
            (options.overwrite || isEmpty(existing.project.yardName)) &&
            existing.project.yardName !== p.yardName
          ) {
            await tx.project.update({
              where: { id: existing.projectId },
              data: { yardName: p.yardName },
            });
            summary.recordsFilled++;
          }
        }

        // Scope lines and evidence, only ever added.
        const scope: Prisma.ProjectScopeItemCreateManyInput[] = plan.periods.flatMap((p) =>
          p.scope.map((line, sortOrder) => ({
            projectId: projectIdByKey.get(p.importKey)!,
            discipline: line.discipline,
            description: line.description,
            sortOrder,
            origin: "IMPORT",
            fingerprint: fingerprint(["scope", p.importKey, line.description]),
          })),
        );
        summary.scopeLinesAdded = (
          await tx.projectScopeItem.createMany({ data: scope, skipDuplicates: true })
        ).count;

        const evidence: Prisma.YardPeriodEvidenceCreateManyInput[] = [
          ...plan.periods.flatMap((p) => p.evidence),
          ...plan.vesselEvidence,
        ].map((e) => ({
          vesselId: vesselByYard.get(e.yardNumber)!.id,
          projectId: e.importKey ? projectIdByKey.get(e.importKey)! : null,
          kind: e.kind,
          sourceId: sourceId(e.sourceUrl),
          sourceUrl: e.sourceUrl,
          sourceQuality: e.sourceQuality,
          confidence: e.confidence,
          issue: e.issue,
          qualification: e.qualification,
          origin: "IMPORT",
          fingerprint: fingerprint([
            "evidence",
            e.kind,
            e.yardNumber,
            e.importKey,
            e.sourceUrl,
            e.issue,
          ]),
        }));
        summary.evidenceAdded = (
          await tx.yardPeriodEvidence.createMany({ data: evidence, skipDuplicates: true })
        ).count;

        // Gaps; a gap's status set in the application survives a re-import.
        const gaps: Prisma.VesselDataGapCreateManyInput[] = plan.gaps.map((g) => ({
          vesselId: g.yardNumber ? vesselByYard.get(g.yardNumber)!.id : null,
          projectId: g.importKey ? projectIdByKey.get(g.importKey)! : null,
          scope: YARD_HISTORY_SCOPE,
          priority: g.priority,
          issue: g.issue,
          evidenceNeeded: g.evidenceNeeded,
          status: g.status,
          reference: register.edition
            ? `Yard-period register, ${register.edition}`
            : "Yard-period register",
          fingerprint: gapFingerprint({ scope: YARD_HISTORY_SCOPE, issue: g.issue }, g.yardNumber),
        }));
        summary.gapsAdded = (
          await tx.vesselDataGap.createMany({ data: gaps, skipDuplicates: true })
        ).count;

        // Each vessel's latest refit: evidence beside the particular, and the
        // particular itself only where it is blank.
        const observations: Prisma.VesselObservationCreateManyInput[] = [];
        for (const [yardNumber, refit] of latestRefits(plan.periods)) {
          const vessel = vesselByYard.get(yardNumber)!;
          const period = plan.periods.find((p) => p.importKey === refit.importKey)!;
          const sourceCode = refit.sourceUrl
            ? (sourceByUrl.get(normaliseUrl(refit.sourceUrl))?.code ?? null)
            : null;
          const o = {
            fieldLabel: "Latest refit/rebuild identified",
            value: String(refit.year),
            basis: `Latest refit or rebuild in the yard-period register${refit.approximate ? " (approximate dates)" : ""}`,
            sourceCode,
          };
          if (vessel.imo) {
            observations.push({
              vesselId: vessel.id,
              fieldKey: "lastRefitYear",
              ...o,
              qualification: `${period.record.periodType}, ${formatPeriod(period.record.startLabel, period.record.endLabel)}`,
              sourceId: sourceId(refit.sourceUrl),
              sourceUrl: refit.sourceUrl,
              observedOn: editionDate,
              origin: "IMPORT",
              fingerprint: observationFingerprint({ imo: vessel.imo, ...o }),
            });
          }
          if (vessel.lastRefitYear == null) {
            await tx.vessel.update({
              where: { id: vessel.id },
              data: { lastRefitYear: refit.year },
            });
            summary.refitYearsFilled++;
          }
        }
        summary.observationsAdded = (
          await tx.vesselObservation.createMany({ data: observations, skipDuplicates: true })
        ).count;

        // Records imported from an earlier edition that this one no longer has.
        const planned = new Set(plan.periods.map((p) => p.importKey));
        const stale = await tx.yardPeriodRecord.findMany({
          where: { origin: "IMPORT", importKey: { notIn: [...planned] } },
          select: { importKey: true },
        });
        for (const s of stale) {
          warnings.push(
            `${s.importKey} was imported from an earlier edition and is not in this one; left as it is.`,
          );
        }

        if (!isNoChange(summary)) {
          await tx.auditLog.create({
            data: {
              actorId: options.actorId ?? null,
              action: "IMPORT",
              resource: "YardPeriodRegister",
              details: {
                ...summary,
                edition: register.edition,
                overwrite: options.overwrite ?? false,
              },
            },
          });
        }

        if (options.check) throw new RollBack({ summary, warnings });
      },
      { timeout: 120_000 },
    );
  } catch (e) {
    if (e instanceof RollBack) return e.result;
    throw e;
  }
  return { summary, warnings };
}
