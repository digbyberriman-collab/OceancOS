// Password reset tokens.
//
// The Bridge onboards every user through "Forgot password?", so this is a
// primary path, not a corner case. Rules:
//
//   - The token is random and only its hash is stored, so a database leak
//     does not yield usable reset links.
//   - Single use, short lived.
//   - Requesting a reset never reveals whether an address is registered.
//   - Completing a reset destroys the user's other sessions.

import { createHash, randomBytes } from "node:crypto";

export const RESET_TOKEN_TTL_MINUTES = 60;

/** Minimum password length accepted when setting a new one. */
export const MIN_PASSWORD_LENGTH = 10;

export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}

export type StoredReset = {
  expiresAt: Date;
  usedAt: Date | null;
};

/** A token is usable only while unexpired and unused. */
export function isResetUsable(reset: StoredReset | null, now: Date = new Date()): boolean {
  if (!reset) return false;
  if (reset.usedAt) return false;
  return reset.expiresAt.getTime() > now.getTime();
}

export type PasswordProblem = "too-short" | "mismatch" | "missing";

/**
 * Validate a new password. Deliberately length-based rather than a character
 * rule: long passphrases beat short complex ones, and crew set these on phones.
 */
export function validateNewPassword(password: string, confirm: string): PasswordProblem | null {
  if (!password || !confirm) return "missing";
  if (password !== confirm) return "mismatch";
  if (password.length < MIN_PASSWORD_LENGTH) return "too-short";
  return null;
}

export function passwordProblemMessage(problem: PasswordProblem): string {
  switch (problem) {
    case "missing":
      return "Enter your new password twice.";
    case "mismatch":
      return "Those two passwords do not match.";
    case "too-short":
      return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
}

export function resetEmailBody(opts: { name: string; url: string }): { text: string; subject: string } {
  return {
    subject: "Reset your OceancOS password",
    text: [
      `Hello ${opts.name},`,
      "",
      "Use the link below to set a new password. It works once and expires in",
      `${RESET_TOKEN_TTL_MINUTES} minutes.`,
      "",
      opts.url,
      "",
      "If you did not ask for this, you can ignore this email — your current",
      "password still works.",
      "",
      "— OceancOS",
    ].join("\n"),
  };
}
