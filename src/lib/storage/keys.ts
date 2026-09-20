// Object-key construction and upload validation.
//
// Pure functions, no SDK and no I/O, so the rules that decide what may be
// uploaded and where it lands are unit-testable on their own.

/** Content types accepted for upload. Anything else is rejected server-side. */
export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

/** Default ceiling per file. The client request form applies a lower cap of its own. */
export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function maxUploadBytes(): number {
  const raw = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_BYTES;
}

export function isAllowedUploadType(contentType: string): contentType is AllowedUploadType {
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(contentType);
}

/**
 * Reduce a user-supplied filename to something safe to put in an object key.
 *
 * Strips directory separators and anything outside a conservative set, collapses
 * runs of separators, and caps the length while preserving the extension. Never
 * returns an empty string.
 */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "")
    .toLowerCase();

  if (!cleaned) return "file";

  if (cleaned.length <= 120) return cleaned;

  // Keep the extension when truncating a very long name.
  const dot = cleaned.lastIndexOf(".");
  if (dot > 0 && cleaned.length - dot <= 12) {
    const ext = cleaned.slice(dot);
    return cleaned.slice(0, 120 - ext.length) + ext;
  }
  return cleaned.slice(0, 120);
}

export type UploadTarget = {
  projectId: string;
  /** Owning record type, e.g. "Job", "ChangeOrder", "AfterSalesCase". */
  resource: string;
  resourceId: string;
  filename: string;
};

/**
 * Build the object key for an upload.
 *
 * Keys are grouped by project then resource so a project's media can be listed,
 * copied or lifecycle-expired as a unit. The random segment prevents collisions
 * and stops one upload from overwriting another with the same filename.
 */
export function buildObjectKey(target: UploadTarget, random: string = randomSegment()): string {
  const parts = [
    "projects",
    slug(target.projectId),
    slug(target.resource),
    slug(target.resourceId),
    `${random}-${safeFilename(target.filename)}`,
  ];
  return parts.join("/");
}

/** Reject keys that try to escape their prefix or address another bucket path. */
export function isSafeObjectKey(key: string): boolean {
  if (!key || key.length > 1024) return false;
  if (key.startsWith("/") || key.includes("//")) return false;
  if (key.split("/").some((segment) => segment === "." || segment === "..")) return false;
  return /^[\w./\-]+$/.test(key);
}

function slug(value: string): string {
  const cleaned = value.replace(/[^\w\-]+/g, "-").replace(/-{2,}/g, "-");
  return cleaned || "unknown";
}

function randomSegment(): string {
  // crypto.randomUUID is available in Node 18+ and in the edge runtime.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
