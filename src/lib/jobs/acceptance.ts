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

/**
 * Fingerprint of exactly what is being signed.
 *
 * Recorded with the acceptance so it can be proved later that the quote was not
 * altered between the code being sent and the signature landing. A change to
 * any line, the total or the validity produces a different hash.
 */
export function quoteFingerprint(job: {
  code: string;
  total: number;
  currency: string;
  validityDays?: number | null;
  lines: { description: string; quantity: number; unit: string; unitPrice: number }[];
}): string {
  const canonical = JSON.stringify({
    code: job.code,
    total: job.total,
    currency: job.currency,
    validityDays: job.validityDays ?? null,
    lines: job.lines.map((l) => [l.description, l.quantity, l.unit, l.unitPrice]),
  });
  return createHash("sha256").update(canonical).digest("hex");
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
