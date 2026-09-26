// Quote acceptance.
//
// Accepting is a signature on money, so it is deliberately more than one click
// (BRIDGE_ALIGNMENT_PLAN.md §7 item 3, and §2.1): review, confirm, then enter a
// six-digit code sent by email. The channel is a field on the challenge, so
// moving to SMS later is a change of channel rather than a rewrite.
//
// Pure functions here; the database work lives in the server action.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const CHALLENGE_TTL_MINUTES = 10;
export const MAX_CHALLENGE_ATTEMPTS = 5;

/** A six-digit code. Short enough to retype from a phone, long enough at this TTL. */
export function generateAcceptanceCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Hash a code for storage, bound to the challenge it belongs to.
 *
 * Including the challenge id means a code captured from one challenge cannot be
 * replayed against another, even if the same six digits come up again.
 */
export function hashAcceptanceCode(challengeId: string, code: string): string {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  return createHash("sha256").update(`${challengeId}:${code}:${secret}`).digest("hex");
}

export function verifyAcceptanceCode(
  challengeId: string,
  code: string,
  storedHash: string
): boolean {
  const candidate = hashAcceptanceCode(challengeId, code.trim());
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function challengeExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CHALLENGE_TTL_MINUTES * 60 * 1000);
}

export type StoredChallenge = {
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
};

export type ChallengeProblem = "expired" | "consumed" | "locked" | "missing";

/** Why a challenge cannot be used, or null when it can. */
export function challengeProblem(
  challenge: StoredChallenge | null,
  now: Date = new Date()
): ChallengeProblem | null {
  if (!challenge) return "missing";
  if (challenge.consumedAt) return "consumed";
  if (challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) return "locked";
  if (challenge.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

export function challengeProblemMessage(problem: ChallengeProblem): string {
  switch (problem) {
    case "missing":
      return "That confirmation has expired. Start again from the quote.";
    case "consumed":
      return "That code has already been used.";
    case "locked":
      return "Too many incorrect codes. Start again from the quote to get a new one.";
    case "expired":
      return `The code expired after ${CHALLENGE_TTL_MINUTES} minutes. Request a new one.`;
  }
}

type NoteRow = { id: string; kind: string; sort: number; text: string };

/**
 * The exclusions a signer is shown, in the order they are shown.
 *
 * The page, the code request and the confirmation all call this, so the order
 * behind the acknowledgement can never differ between them. Ties on `sort`
 * break on id because the database gives no order for equal keys.
 */
export function exclusionNotes<T extends NoteRow>(notes: T[]): T[] {
  return notes
    .filter((n) => n.kind === "EXCLUSION")
    .sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function exclusionTexts(notes: NoteRow[]): string[] {
  return exclusionNotes(notes).map((n) => n.text);
}

/**
 * Fingerprint of the exclusions as read, or null when there are none.
 *
 * JSON rather than a join, so ["a,b"] and ["a", "b"] cannot collide.
 */
export function exclusionsFingerprint(texts: string[]): string | null {
  if (texts.length === 0) return null;
  return createHash("sha256").update(JSON.stringify(texts)).digest("hex");
}

export type AcknowledgementProblem = "missing" | "stale";

/**
 * Whether the signer confirmed the exclusions they were actually shown.
 *
 * The checkbox carries the fingerprint of the list on screen, so a list that
 * changed after the page was rendered reads as stale rather than acknowledged.
 */
export function exclusionsAcknowledgementProblem(
  expected: string | null,
  given: unknown
): AcknowledgementProblem | null {
  if (!expected) return null;
  if (typeof given !== "string" || given === "") return "missing";
  return given === expected ? null : "stale";
}

/**
 * Fingerprint of exactly what is being signed.
 *
 * Recorded with the acceptance so it can be proved later that the quote was not
 * altered between the code being sent and the signature landing. A change to
 * any line, the total, the validity or an exclusion produces a different hash.
 *
 * Exclusions are appended only when there are some, so a quote without any
 * hashes exactly as it did before they were covered.
 */
export function quoteFingerprint(job: {
  code: string;
  total: number;
  currency: string;
  validityDays?: number | null;
  lines: { description: string; quantity: number; unit: string; unitPrice: number }[];
  exclusions?: string[];
}): string {
  const canonical: Record<string, unknown> = {
    code: job.code,
    total: job.total,
    currency: job.currency,
    validityDays: job.validityDays ?? null,
    lines: job.lines.map((l) => [l.description, l.quantity, l.unit, l.unitPrice]),
  };
  if (job.exclusions && job.exclusions.length > 0) canonical.exclusions = job.exclusions;
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function acceptanceEmail(opts: {
  name: string;
  code: string;
  jobCode: string;
  jobTitle: string;
  amount: string;
}): { subject: string; text: string } {
  return {
    subject: `Confirmation code for ${opts.jobCode}`,
    text: [
      `Hello ${opts.name},`,
      "",
      `Your confirmation code is ${opts.code}`,
      "",
      `This authorises ${opts.jobCode} — ${opts.jobTitle}, for ${opts.amount}.`,
      `The code expires in ${CHALLENGE_TTL_MINUTES} minutes and can be used once.`,
      "",
      "If you did not start this, do not enter the code. Nothing has been signed,",
      "and you should tell your project manager.",
      "",
      "— OceancOS",
    ].join("\n"),
  };
}
