import { describe, it, expect } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  RESET_TOKEN_TTL_MINUTES,
  generateResetToken,
  hashResetToken,
  isResetUsable,
  passwordProblemMessage,
  resetEmailBody,
  resetTokenExpiry,
  validateNewPassword,
} from "@/lib/passwordReset";

describe("reset tokens", () => {
  it("generates a long random token", () => {
    const token = generateResetToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateResetToken));
    expect(tokens.size).toBe(200);
  });

  it("hashes deterministically and irreversibly", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
    expect(hashResetToken(token)).not.toBe(token);
    expect(hashResetToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("gives different tokens different hashes", () => {
    expect(hashResetToken("a")).not.toBe(hashResetToken("b"));
  });

  it("expires an hour out", () => {
    const now = new Date("2026-09-20T12:00:00Z");
    expect(resetTokenExpiry(now).toISOString()).toBe("2026-09-20T13:00:00.000Z");
    expect(RESET_TOKEN_TTL_MINUTES).toBe(60);
  });
});

describe("isResetUsable", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const future = new Date("2026-09-20T12:30:00Z");
  const past = new Date("2026-09-20T11:30:00Z");

  it("accepts an unused, unexpired token", () => {
    expect(isResetUsable({ expiresAt: future, usedAt: null }, now)).toBe(true);
  });

  it("rejects an expired token", () => {
    expect(isResetUsable({ expiresAt: past, usedAt: null }, now)).toBe(false);
  });

  it("rejects a token already used", () => {
    expect(isResetUsable({ expiresAt: future, usedAt: past }, now)).toBe(false);
  });

  it("rejects a token that does not exist", () => {
    expect(isResetUsable(null, now)).toBe(false);
  });

  it("rejects a token expiring exactly now", () => {
    expect(isResetUsable({ expiresAt: now, usedAt: null }, now)).toBe(false);
  });
});

describe("validateNewPassword", () => {
  const good = "a-long-enough-passphrase";

  it("accepts a long matching password", () => {
    expect(validateNewPassword(good, good)).toBeNull();
  });

  it("rejects a mismatch", () => {
    expect(validateNewPassword(good, good + "x")).toBe("mismatch");
  });

  it("rejects a short password", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short)).toBe("too-short");
  });

  it("accepts exactly the minimum length", () => {
    const exact = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(validateNewPassword(exact, exact)).toBeNull();
  });

  it("rejects empty input", () => {
    expect(validateNewPassword("", "")).toBe("missing");
    expect(validateNewPassword(good, "")).toBe("missing");
  });

  it("checks the mismatch before the length, so the message is the useful one", () => {
    expect(validateNewPassword("short", "different")).toBe("mismatch");
  });

  it("has a message for every problem", () => {
    for (const problem of ["missing", "mismatch", "too-short"] as const) {
      expect(passwordProblemMessage(problem).length).toBeGreaterThan(0);
    }
  });
});

describe("reset email", () => {
  it("carries the link and says the terms", () => {
    const { subject, text } = resetEmailBody({
      name: "Cara Captain",
      url: "https://example.test/reset/abc",
    });
    expect(subject).toMatch(/reset/i);
    expect(text).toContain("Cara Captain");
    expect(text).toContain("https://example.test/reset/abc");
    expect(text).toContain("once");
    expect(text).toContain(String(RESET_TOKEN_TTL_MINUTES));
  });

  it("tells a recipient who did not ask that they can ignore it", () => {
    const { text } = resetEmailBody({ name: "X", url: "https://example.test/reset/abc" });
    expect(text).toMatch(/did not ask/i);
  });
});
