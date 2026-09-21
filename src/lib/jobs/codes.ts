// Job code rules.
//
// Yards issue hierarchical codes: a section letter, a group, a job, and
// sometimes a revision — `D.0130.05`, `I.2200.20-01`. Decided in
// BRIDGE_ALIGNMENT_PLAN.md §7 item 2: adopt that shape by default so imported
// quotes keep the code the yard actually issued, with a per-project override
// for yards that number differently.
//
// Pure functions, so the rules are testable without a database.

/** The MB92-style default: `X.NNNN[.NN][-NN]`. */
export const DEFAULT_JOB_CODE_PATTERN = "^[A-Z]\\.\\d{4}(\\.\\d{2})?(-\\d{2})?$";

export type CodeRules = {
  /** Regular expression source. A project may override the default. */
  pattern?: string | null;
};

export function codeRegex(rules?: CodeRules): RegExp {
  const source = rules?.pattern?.trim() || DEFAULT_JOB_CODE_PATTERN;
  try {
    return new RegExp(source);
  } catch {
    // A project must never be locked out by a bad override.
    return new RegExp(DEFAULT_JOB_CODE_PATTERN);
  }
}

/** Upper-case and strip whitespace. Codes are matched and sorted on. */
export function normaliseJobCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidJobCode(value: string, rules?: CodeRules): boolean {
  const code = normaliseJobCode(value);
  if (!code) return false;
  return codeRegex(rules).test(code);
}

/**
 * The group a code belongs to: `D.0130.05` → `D.0130`.
 *
 * The list groups jobs under their group heading the way the yard's own quote
 * pack does, so the client sees the structure they already know.
 */
export function groupCodeOf(value: string): string | null {
  const code = normaliseJobCode(value);
  const match = code.match(/^([A-Z]\.\d{4})/);
  if (match) return match[1];

  // Unrecognised shapes still group on everything before the last separator,
  // so a project using its own scheme is not left ungrouped.
  const lastDot = code.lastIndexOf(".");
  return lastDot > 0 ? code.slice(0, lastDot) : null;
}

/** The section letter of a code: `D.0130.05` → `D`. */
export function sectionLetterOf(value: string): string | null {
  const code = normaliseJobCode(value);
  const match = code.match(/^([A-Z])\./);
  return match ? match[1] : null;
}

/**
 * Sort codes the way a person reads them: by section, then group number, then
 * job number, so `D.0130.5` and `D.0130.10` land in numeric order rather than
 * the string order that would put 10 before 5.
 */
export function compareJobCodes(a: string, b: string): number {
  const parts = (value: string) =>
    normaliseJobCode(value)
      .split(/[.\-]/)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part));

  const left = parts(a);
  const right = parts(b);

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (typeof l === "number" && typeof r === "number") {
      if (l !== r) return l - r;
    } else {
      const comparison = String(l).localeCompare(String(r));
      if (comparison !== 0) return comparison;
    }
  }
  return 0;
}

/**
 * Suggest the next job code in a group.
 *
 * Yards number within a group in tens (`.10`, `.20`) so a job can be inserted
 * later without renumbering. This follows that convention and falls back to
 * the next free step when the tens are used up.
 */
export function nextCodeInGroup(groupCode: string, existing: string[]): string {
  const group = normaliseJobCode(groupCode);
  const used = new Set(
    existing
      .map(normaliseJobCode)
      .filter((code) => code.startsWith(`${group}.`))
      .map((code) => Number(code.slice(group.length + 1).split("-")[0]))
      .filter((n) => Number.isFinite(n))
  );

  for (let n = 10; n <= 99; n += 10) {
    if (!used.has(n)) return `${group}.${String(n).padStart(2, "0")}`;
  }
  for (let n = 1; n <= 99; n++) {
    if (!used.has(n)) return `${group}.${String(n).padStart(2, "0")}`;
  }
  return `${group}.99`;
}
