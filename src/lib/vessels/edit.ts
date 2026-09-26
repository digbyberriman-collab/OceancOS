// Reading the vessel particulars form.
//
// The form is generated from the field catalogue, so it is read back the same
// way: each field's kind decides how its text becomes a value and what counts
// as nonsense. Kept pure so the rules are testable without a form or database.

import {
  VESSEL_FIELDS,
  isValidImo,
  isValidMmsi,
  type VesselField,
  type VesselFieldKey,
  type VesselParticulars,
} from "./fields";

export type FieldProblem = { field: VesselFieldKey; message: string };

type Parsed = string | number | Date | null;

const MIN_YEAR = 1800;
const MAX_YEAR = 2100;

function parseField(field: VesselField, raw: string): { value: Parsed } | { error: string } {
  const text = raw.trim();
  if (!text) return { value: null };

  switch (field.kind) {
    case "int":
    case "decimal": {
      const n = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(n)) return { error: `${field.label} must be a number.` };
      if (n < 0) return { error: `${field.label} cannot be negative.` };
      if (field.kind === "int" && !Number.isInteger(n)) return { error: `${field.label} must be a whole number.` };
      return { value: n };
    }
    case "year": {
      const n = Number(text);
      if (!Number.isInteger(n) || n < MIN_YEAR || n > MAX_YEAR) {
        return { error: `${field.label} must be a year between ${MIN_YEAR} and ${MAX_YEAR}.` };
      }
      return { value: n };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: `${field.label} must be a date.` };
      const d = new Date(`${text}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) return { error: `${field.label} must be a date.` };
      return { value: d };
    }
    case "url": {
      try {
        const url = new URL(text);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
        return { value: url.toString() };
      } catch {
        return { error: `${field.label} must be a web address starting https://.` };
      }
    }
    default:
      return { value: text };
  }
}

/**
 * Read submitted text into particulars. Every catalogue field present in the
 * submission is returned — an emptied field becomes null, which clears it.
 * Fields absent from the submission are left out, so a partial form cannot
 * blank the rest.
 */
export function parseVesselForm(input: Record<string, string | undefined>): {
  data: Partial<VesselParticulars>;
  problems: FieldProblem[];
} {
  const data: Record<string, Parsed> = {};
  const problems: FieldProblem[] = [];

  for (const field of VESSEL_FIELDS) {
    const raw = input[field.key];
    if (raw === undefined) continue;
    const result = parseField(field, raw);
    if ("error" in result) problems.push({ field: field.key, message: result.error });
    else data[field.key] = result.value;
  }

  if ("name" in data && !data.name) problems.push({ field: "name", message: "Vessel name is required." });
  if (typeof data.yardNumber === "string") data.yardNumber = data.yardNumber.toUpperCase().replace(/\s+/g, "");
  if (typeof data.imo === "string") {
    data.imo = data.imo.replace(/^IMO\s*/i, "");
    if (!isValidImo(data.imo)) {
      problems.push({ field: "imo", message: "IMO number must be seven digits with a valid check digit." });
    }
  }
  if (typeof data.mmsi === "string" && !isValidMmsi(data.mmsi)) {
    problems.push({ field: "mmsi", message: "MMSI must be nine digits." });
  }
  if (typeof data.callSign === "string") data.callSign = data.callSign.toUpperCase();

  return { data: data as Partial<VesselParticulars>, problems };
}

/** The value as stored text for an observation: numbers plain, dates as ISO days. */
export function observationText(value: Parsed): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a == null || a === "") return b == null || b === "";
  return a === b;
}

/** Keys whose submitted value differs from the stored one. */
export function changedFields(
  existing: Partial<Record<VesselFieldKey, unknown>>,
  incoming: Partial<VesselParticulars>
): VesselFieldKey[] {
  return (Object.keys(incoming) as VesselFieldKey[]).filter((key) => !same(existing[key], incoming[key]));
}
