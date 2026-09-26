// The vessel field catalogue.
//
// One list decides which particulars a vessel has, what each is called, its
// unit, and the order it appears in — on the particulars panel, the edit form
// and the fleet register alike. Every vessel shows every field, so a missing
// value is a visible placeholder waiting to be filled rather than an absent
// row nobody notices. Kept free of Prisma and React so the rules are testable
// on their own.

export type VesselFieldKind = "text" | "longtext" | "int" | "decimal" | "year" | "url" | "date";

/** The values the catalogue describes, as stored on `Vessel`. */
export type VesselParticulars = {
  // Identity & registry
  name: string;
  yardNumber: string | null;
  builder: string | null;
  vesselType: string | null;
  formerNames: string | null;
  deliveredYear: number | null;
  imo: string | null;
  mmsi: string | null;
  callSign: string | null;
  flag: string | null;
  portOfRegistry: string | null;
  officialNumber: string | null;
  // Dimensions & tonnage
  loa: number | null;
  beam: number | null;
  draft: number | null;
  grossTonnage: number | null;
  netTonnage: number | null;
  deadweight: number | null;
  displacement: number | null;
  dimensionsBasis: string | null;
  tonnageBasis: string | null;
  // Design & construction
  hullMaterial: string | null;
  superstructureMaterial: string | null;
  navalArchitect: string | null;
  exteriorDesigner: string | null;
  interiorDesigner: string | null;
  lastRefitYear: number | null;
  sailArea: number | null;
  features: string | null;
  // Machinery & performance
  mainMachinery: string | null;
  propulsion: string | null;
  generators: string | null;
  cruiseSpeed: number | null;
  maxSpeed: number | null;
  maxSailSpeed: number | null;
  rangeNm: number | null;
  fuelCapacity: number | null;
  freshWaterCapacity: number | null;
  // Accommodation & manning
  guests: number | null;
  guestCabins: number | null;
  crew: number | null;
  maxPersonsOnBoard: number | null;
  // Class & certification
  classSociety: string | null;
  classNotation: string | null;
  particularsCheckedOn: Date | null;
  // Notes & references
  identityNote: string | null;
  dimensionsNote: string | null;
  technicalNote: string | null;
  yardNumberBasis: string | null;
  yardNumberNote: string | null;
  builderUrl: string | null;
  databaseUrl: string | null;
  identitySupplementUrl: string | null;
  notes: string | null;
};

export type VesselFieldKey = keyof VesselParticulars;

export type VesselField = {
  key: VesselFieldKey;
  label: string;
  kind: VesselFieldKind;
  unit?: string;
  /** Shown under the value and on the form: what the figure is and is not. */
  hint?: string;
  /** Takes the full row of the two-column grid. */
  wide?: boolean;
};

export type VesselSection = {
  key: string;
  title: string;
  /** Reference sections (notes, links) are not particulars and do not count toward completeness. */
  reference?: boolean;
  fields: VesselField[];
};

export const VESSEL_SECTIONS: VesselSection[] = [
  {
    key: "identity",
    title: "Identity & registry",
    fields: [
      { key: "name", label: "Vessel name", kind: "text" },
      { key: "yardNumber", label: "Yard number", kind: "text" },
      { key: "builder", label: "Builder", kind: "text" },
      { key: "vesselType", label: "Vessel type", kind: "text" },
      { key: "deliveredYear", label: "Delivered", kind: "year", hint: "Delivery year, not keel-laying or launch." },
      { key: "formerNames", label: "Former names / aliases", kind: "text" },
      { key: "imo", label: "IMO number", kind: "text" },
      { key: "mmsi", label: "MMSI", kind: "text" },
      { key: "callSign", label: "Call sign", kind: "text" },
      { key: "flag", label: "Flag", kind: "text" },
      { key: "portOfRegistry", label: "Port of registry", kind: "text" },
      { key: "officialNumber", label: "Official number", kind: "text" },
    ],
  },
  {
    key: "dimensions",
    title: "Dimensions & tonnage",
    fields: [
      { key: "loa", label: "Length overall", kind: "decimal", unit: "m" },
      { key: "beam", label: "Beam", kind: "decimal", unit: "m", hint: "Overall beam, not moulded breadth." },
      { key: "draft", label: "Draft", kind: "decimal", unit: "m", hint: "Published figure, not a certified maximum draft." },
      { key: "grossTonnage", label: "Gross tonnage", kind: "int", unit: "GT" },
      { key: "netTonnage", label: "Net tonnage", kind: "int", unit: "NT" },
      { key: "deadweight", label: "Deadweight", kind: "decimal", unit: "t" },
      { key: "displacement", label: "Displacement", kind: "decimal", unit: "t" },
      { key: "dimensionsBasis", label: "Length / beam basis", kind: "text", wide: true },
      { key: "tonnageBasis", label: "Tonnage basis", kind: "text", wide: true },
    ],
  },
  {
    key: "design",
    title: "Design & construction",
    fields: [
      { key: "hullMaterial", label: "Hull", kind: "text" },
      { key: "superstructureMaterial", label: "Superstructure", kind: "text" },
      { key: "navalArchitect", label: "Naval architecture / engineering", kind: "text" },
      { key: "exteriorDesigner", label: "Exterior design", kind: "text" },
      { key: "interiorDesigner", label: "Interior design", kind: "text" },
      { key: "lastRefitYear", label: "Latest refit / rebuild", kind: "year" },
      { key: "sailArea", label: "Sail area", kind: "decimal", unit: "m²" },
      { key: "features", label: "Selected features", kind: "longtext", wide: true },
    ],
  },
  {
    key: "machinery",
    title: "Machinery & performance",
    fields: [
      { key: "mainMachinery", label: "Main machinery", kind: "text" },
      { key: "propulsion", label: "Propulsion / energy", kind: "text" },
      { key: "generators", label: "Generators", kind: "text" },
      { key: "cruiseSpeed", label: "Cruising speed", kind: "decimal", unit: "kn" },
      { key: "maxSpeed", label: "Maximum speed (motor)", kind: "decimal", unit: "kn" },
      { key: "maxSailSpeed", label: "Maximum speed (sail)", kind: "decimal", unit: "kn" },
      { key: "rangeNm", label: "Range", kind: "int", unit: "nm", hint: "Speed and load condition as published." },
      { key: "fuelCapacity", label: "Fuel capacity", kind: "int", unit: "L" },
      { key: "freshWaterCapacity", label: "Fresh water capacity", kind: "int", unit: "L" },
    ],
  },
  {
    key: "accommodation",
    title: "Accommodation & manning",
    fields: [
      { key: "guests", label: "Guests", kind: "int", hint: "Published figure, not a certified limit." },
      { key: "guestCabins", label: "Guest cabins", kind: "int" },
      { key: "crew", label: "Crew", kind: "int", hint: "Published figure, not safe manning." },
      { key: "maxPersonsOnBoard", label: "Maximum persons on board", kind: "int", hint: "From the certificate." },
    ],
  },
  {
    key: "class",
    title: "Class & certification",
    fields: [
      { key: "classSociety", label: "Class society", kind: "text" },
      { key: "classNotation", label: "Class notation", kind: "text" },
      { key: "particularsCheckedOn", label: "Particulars last checked", kind: "date" },
    ],
  },
  {
    key: "references",
    title: "Notes & references",
    reference: true,
    fields: [
      { key: "identityNote", label: "Identity qualification", kind: "longtext", wide: true },
      { key: "dimensionsNote", label: "Dimensions / name notes", kind: "longtext", wide: true },
      { key: "technicalNote", label: "Technical qualification", kind: "longtext", wide: true },
      { key: "yardNumberBasis", label: "Yard number evidence", kind: "text" },
      { key: "yardNumberNote", label: "Yard number qualification", kind: "longtext", wide: true },
      { key: "builderUrl", label: "Builder page", kind: "url", wide: true },
      { key: "databaseUrl", label: "Vessel database", kind: "url", wide: true },
      { key: "identitySupplementUrl", label: "Identity supplement", kind: "url", wide: true },
      { key: "notes", label: "Notes", kind: "longtext", wide: true },
    ],
  },
];

export const VESSEL_FIELDS: VesselField[] = VESSEL_SECTIONS.flatMap((s) => s.fields);

const FIELD_BY_KEY = new Map(VESSEL_FIELDS.map((f) => [f.key, f]));

export function vesselField(key: VesselFieldKey): VesselField {
  const field = FIELD_BY_KEY.get(key);
  if (!field) throw new Error(`Unknown vessel field: ${key}`);
  return field;
}

export function isVesselFieldKey(key: string): key is VesselFieldKey {
  return FIELD_BY_KEY.has(key as VesselFieldKey);
}

/**
 * Field Evidence labels in the vessel register workbook, mapped to the field
 * each one bears on. Several labels share a field on purpose: builder, database
 * and broker figures for the same dimension are alternatives to compare.
 */
export const EVIDENCE_FIELD_MAP: Record<string, VesselFieldKey> = {
  "Yard code": "yardNumber",
  "Current published name": "name",
  "Former names / aliases": "formerNames",
  Delivered: "deliveredYear",
  "Database build year": "deliveredYear",
  IMO: "imo",
  MMSI: "mmsi",
  "Call sign": "callSign",
  Flag: "flag",
  "Preferred published LOA": "loa",
  "Database static LOA": "loa",
  "Broker LOA": "loa",
  "Naval-architect body length": "loa",
  "Preferred published beam": "beam",
  "Database static beam": "beam",
  "Broker beam": "beam",
  "Naval-architect body beam": "beam",
  "Designer as-built beam": "beam",
  "Working gross tonnage": "grossTonnage",
  "Database static GT": "grossTonnage",
  "Broker gross tonnage": "grossTonnage",
  "Database deadweight": "deadweight",
  "Published draft": "draft",
  "Hull material": "hullMaterial",
  "Superstructure material": "superstructureMaterial",
  "Naval architecture / engineering": "navalArchitect",
  "Exterior design": "exteriorDesigner",
  "Interior design": "interiorDesigner",
  "Latest refit/rebuild identified": "lastRefitYear",
  "Sail area": "sailArea",
  "Selected publicly described features": "features",
  "Main machinery (published wording)": "mainMachinery",
  "Propulsion / energy systems": "propulsion",
  "Generator specification": "generators",
  "Cruising speed": "cruiseSpeed",
  "Maximum motor speed": "maxSpeed",
  "Published maximum speed (mode unspecified)": "maxSpeed",
  "Maximum sailing speed": "maxSailSpeed",
  "Published range": "rangeNm",
  "Published guests": "guests",
  "Published guest cabins": "guestCabins",
  "Published crew": "crew",
  "Published class society": "classSociety",
};

// ---------- Values ----------

type FieldValue = string | number | Date | null | undefined;

/** Text a source writes for "no supported value". Kept as evidence, never taken as a value. */
const NO_VALUE_TEXT = new Set(["", "not verified", "unverified", "unknown", "n/a", "na", "tbc", "tba", "-", "–", "—"]);

export function isNoValueText(value: string | null | undefined): boolean {
  return NO_VALUE_TEXT.has(String(value ?? "").trim().toLowerCase());
}

export function isBlank(value: FieldValue): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/**
 * A value as it reads on screen, or null when there is nothing to show — the
 * caller renders its placeholder. Years and identifiers are not grouped with
 * thousands separators; measurements are.
 */
export function formatVesselValue(field: VesselField, value: FieldValue): string | null {
  if (isBlank(value)) return null;
  switch (field.kind) {
    case "int":
    case "decimal": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return String(value);
      return field.unit ? `${NUMBER_FORMAT.format(n)} ${field.unit}` : NUMBER_FORMAT.format(n);
    }
    case "year":
      return String(value);
    case "date": {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    }
    default:
      return String(value).trim();
  }
}

export type Completeness = { filled: number; total: number; pct: number; missing: VesselFieldKey[] };

/** How many particulars are recorded. Notes and links are not counted. */
export function vesselCompleteness(vessel: Partial<VesselParticulars>): Completeness {
  const fields = VESSEL_SECTIONS.filter((s) => !s.reference).flatMap((s) => s.fields);
  const missing = fields.filter((f) => isBlank(vessel[f.key] as FieldValue)).map((f) => f.key);
  const filled = fields.length - missing.length;
  return { filled, total: fields.length, pct: Math.round((filled / fields.length) * 100), missing };
}

// ---------- Identifiers ----------

/**
 * IMO ship identification number check digit: the first six digits weighted
 * 7..2, summed, and the last digit of that sum must equal the seventh. A pass
 * shows the number is well formed, not that it belongs to this vessel.
 */
export function isValidImo(value: string | null | undefined): boolean {
  const digits = String(value ?? "").replace(/^IMO\s*/i, "").trim();
  if (!/^\d{7}$/.test(digits)) return false;
  const sum = [...digits.slice(0, 6)].reduce((acc, d, i) => acc + Number(d) * (7 - i), 0);
  return sum % 10 === Number(digits[6]);
}

/** Only web addresses become links; anything else (a pasted note, a script URL) is shown as text. */
export function isWebUrl(value: string | null | undefined): value is string {
  return /^https?:\/\/\S+$/i.test(String(value ?? "").trim());
}

export function isValidMmsi(value: string | null | undefined): boolean {
  return /^\d{9}$/.test(String(value ?? "").trim());
}

// ---------- Conflicts ----------

/** An observation as far as conflict detection is concerned. */
export type ObservedValue = { fieldKey: string | null; value: string };

const NUMERIC_KINDS: VesselFieldKind[] = ["int", "decimal", "year"];

/** Fields with one right answer, compared as text. */
const IDENTIFIER_KEYS: VesselFieldKey[] = ["yardNumber", "imo", "mmsi", "callSign"];

/** Numbers within this are treated as the same figure (published rounding). */
const NUMERIC_TOLERANCE = 0.005;

function parseNumber(value: string): number | null {
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Observations of a field whose value differs from the preferred one.
 *
 * Only fields with a single right answer are compared: numbers, years and
 * identifiers. Descriptive text (designers, machinery wording, features) is
 * phrased differently from source to source, so a textual difference there is
 * not a conflict and is not reported as one.
 */
export function conflictingObservations<T extends ObservedValue>(
  field: VesselField,
  preferred: FieldValue,
  observations: T[]
): T[] {
  if (isBlank(preferred)) return [];
  const relevant = observations.filter((o) => o.fieldKey === field.key && !isNoValueText(o.value));

  if (NUMERIC_KINDS.includes(field.kind)) {
    const target = typeof preferred === "number" ? preferred : parseNumber(String(preferred));
    if (target == null) return [];
    return relevant.filter((o) => {
      const n = parseNumber(o.value);
      return n != null && Math.abs(n - target) > NUMERIC_TOLERANCE;
    });
  }

  if (IDENTIFIER_KEYS.includes(field.key)) {
    const target = normaliseText(String(preferred));
    return relevant.filter((o) => normaliseText(o.value) !== target);
  }

  return [];
}
