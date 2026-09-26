import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  CHALLENGE_TTL_MINUTES,
  MAX_CHALLENGE_ATTEMPTS,
  acceptanceEmail,
  challengeExpiry,
  challengeProblem,
  challengeProblemMessage,
  exclusionNotes,
  exclusionTexts,
  exclusionsAcknowledgementProblem,
  exclusionsFingerprint,
  generateAcceptanceCode,
  hashAcceptanceCode,
  quoteFingerprint,
  verifyAcceptanceCode,
} from "@/lib/jobs/acceptance";

const quote = {
  code: "D.0130.05",
  total: 1_485,
  currency: "EUR",
  validityDays: 5,
  lines: [
    { description: "Skilled worker", quantity: 16, unit: "HR", unitPrice: 67.5 },
    { description: "Materials", quantity: 1, unit: "UN", unitPrice: 405 },
  ],
};

describe("acceptance codes", () => {
  it("is six digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateAcceptanceCode()).toMatch(/^\d{6}$/);
    }
  });

  it("keeps leading zeros rather than shortening the code", () => {
    const codes = Array.from({ length: 400 }, generateAcceptanceCode);
    expect(codes.every((c) => c.length === 6)).toBe(true);
  });

  it("varies", () => {
    const codes = new Set(Array.from({ length: 200 }, generateAcceptanceCode));
    expect(codes.size).toBeGreaterThan(150);
  });

  it("hashes deterministically and irreversibly", () => {
    const hash = hashAcceptanceCode("ch_1", "123456");
    expect(hash).toBe(hashAcceptanceCode("ch_1", "123456"));
    expect(hash).not.toContain("123456");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("binds the hash to its challenge, so a code cannot be replayed elsewhere", () => {
    expect(hashAcceptanceCode("ch_1", "123456")).not.toBe(hashAcceptanceCode("ch_2", "123456"));
  });

  it("verifies the right code and rejects the wrong one", () => {
    const stored = hashAcceptanceCode("ch_1", "123456");
    expect(verifyAcceptanceCode("ch_1", "123456", stored)).toBe(true);
    expect(verifyAcceptanceCode("ch_1", "123457", stored)).toBe(false);
  });

  it("rejects a correct code presented against another challenge", () => {
    const stored = hashAcceptanceCode("ch_1", "123456");
    expect(verifyAcceptanceCode("ch_2", "123456", stored)).toBe(false);
  });

  it("tolerates surrounding whitespace, which phones add", () => {
    const stored = hashAcceptanceCode("ch_1", "123456");
    expect(verifyAcceptanceCode("ch_1", " 123456 ", stored)).toBe(true);
  });

  it("does not throw on a malformed stored hash", () => {
    expect(verifyAcceptanceCode("ch_1", "123456", "not-a-hash")).toBe(false);
    expect(verifyAcceptanceCode("ch_1", "123456", "")).toBe(false);
  });
});

describe("challenge lifecycle", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  const live = { expiresAt: new Date("2026-06-01T12:05:00Z"), consumedAt: null, attempts: 0 };

  it("expires ten minutes out", () => {
    expect(challengeExpiry(now).toISOString()).toBe("2026-06-01T12:10:00.000Z");
    expect(CHALLENGE_TTL_MINUTES).toBe(10);
  });

  it("accepts a live challenge", () => {
    expect(challengeProblem(live, now)).toBeNull();
  });

  it("rejects one that has expired", () => {
    expect(challengeProblem({ ...live, expiresAt: new Date("2026-06-01T11:59:00Z") }, now)).toBe(
      "expired"
    );
  });

  it("rejects one already used", () => {
    expect(challengeProblem({ ...live, consumedAt: now }, now)).toBe("consumed");
  });

  it("locks out after too many attempts", () => {
    expect(challengeProblem({ ...live, attempts: MAX_CHALLENGE_ATTEMPTS }, now)).toBe("locked");
    expect(challengeProblem({ ...live, attempts: MAX_CHALLENGE_ATTEMPTS - 1 }, now)).toBeNull();
  });

  it("rejects a missing challenge", () => {
    expect(challengeProblem(null, now)).toBe("missing");
  });

  it("has a message for every problem", () => {
    for (const problem of ["missing", "consumed", "locked", "expired"] as const) {
      expect(challengeProblemMessage(problem).length).toBeGreaterThan(0);
    }
  });
});

describe("quote fingerprint", () => {
  it("is stable for the same quote", () => {
    expect(quoteFingerprint(quote)).toBe(quoteFingerprint({ ...quote }));
  });

  it("changes when the total changes", () => {
    expect(quoteFingerprint({ ...quote, total: 1_486 })).not.toBe(quoteFingerprint(quote));
  });

  it("changes when a line price changes", () => {
    const altered = {
      ...quote,
      lines: [{ ...quote.lines[0], unitPrice: 70 }, quote.lines[1]],
    };
    expect(quoteFingerprint(altered)).not.toBe(quoteFingerprint(quote));
  });

  it("changes when a line is added or removed", () => {
    expect(quoteFingerprint({ ...quote, lines: [quote.lines[0]] })).not.toBe(
      quoteFingerprint(quote)
    );
  });

  it("changes when the validity changes", () => {
    expect(quoteFingerprint({ ...quote, validityDays: 30 })).not.toBe(quoteFingerprint(quote));
  });

  it("changes when the currency changes", () => {
    expect(quoteFingerprint({ ...quote, currency: "GBP" })).not.toBe(quoteFingerprint(quote));
  });

  it("is order-sensitive, since the reader sees the lines in order", () => {
    const swapped = { ...quote, lines: [quote.lines[1], quote.lines[0]] };
    expect(quoteFingerprint(swapped)).not.toBe(quoteFingerprint(quote));
  });
});

describe("exclusions", () => {
  // The shape Prisma returns for job.notes, deliberately out of order.
  const notes = [
    { id: "n3", jobId: "j1", kind: "NOTE", sort: 0, text: "Quantities are estimated." },
    { id: "n2", jobId: "j1", kind: "EXCLUSION", sort: 1, text: "Rams renewed if scored." },
    { id: "n1", jobId: "j1", kind: "EXCLUSION", sort: 0, text: "Deckhead panels removed." },
  ];

  it("keeps only exclusions, in the order the signer reads them", () => {
    expect(exclusionTexts(notes)).toEqual(["Deckhead panels removed.", "Rams renewed if scored."]);
    expect(exclusionNotes(notes).map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("breaks ties on id, since the database gives no order for equal sort keys", () => {
    const tied = [
      { id: "b", kind: "EXCLUSION", sort: 0, text: "second" },
      { id: "a", kind: "EXCLUSION", sort: 0, text: "first" },
    ];
    expect(exclusionTexts(tied)).toEqual(["first", "second"]);
  });

  it("has no fingerprint when there is nothing to acknowledge", () => {
    expect(exclusionsFingerprint([])).toBeNull();
  });

  it("fingerprints stably, and in order", () => {
    const texts = exclusionTexts(notes);
    expect(exclusionsFingerprint(texts)).toBe(exclusionsFingerprint([...texts]));
    expect(exclusionsFingerprint([...texts].reverse())).not.toBe(exclusionsFingerprint(texts));
  });

  it("cannot be fooled by moving a comma between items", () => {
    expect(exclusionsFingerprint(["a,b"])).not.toBe(exclusionsFingerprint(["a", "b"]));
  });

  it("requires the acknowledgement only when there are exclusions", () => {
    expect(exclusionsAcknowledgementProblem(null, null)).toBeNull();
    expect(exclusionsAcknowledgementProblem(null, "anything")).toBeNull();
  });

  it("treats a missing tick as missing and a different list as stale", () => {
    const current = exclusionsFingerprint(exclusionTexts(notes));
    expect(exclusionsAcknowledgementProblem(current, null)).toBe("missing");
    expect(exclusionsAcknowledgementProblem(current, "")).toBe("missing");
    expect(exclusionsAcknowledgementProblem(current, exclusionsFingerprint(["old text"]))).toBe(
      "stale"
    );
    expect(exclusionsAcknowledgementProblem(current, current)).toBeNull();
  });

  it("leaves the fingerprint of a quote without exclusions exactly as it was", () => {
    // The canonical form before exclusions were covered. Codes already sent for
    // quotes without exclusions must keep verifying after the change.
    const before = createHash("sha256")
      .update(
        JSON.stringify({
          code: quote.code,
          total: quote.total,
          currency: quote.currency,
          validityDays: quote.validityDays,
          lines: quote.lines.map((l) => [l.description, l.quantity, l.unit, l.unitPrice]),
        })
      )
      .digest("hex");
    expect(quoteFingerprint(quote)).toBe(before);
    expect(quoteFingerprint({ ...quote, exclusions: [] })).toBe(before);
  });

  it("binds the quote fingerprint to the exclusions when there are some", () => {
    const withExclusions = { ...quote, exclusions: exclusionTexts(notes) };
    expect(quoteFingerprint(withExclusions)).not.toBe(quoteFingerprint(quote));
    expect(
      quoteFingerprint({ ...quote, exclusions: ["Deckhead panels removed.", "Rams renewed."] })
    ).not.toBe(quoteFingerprint(withExclusions));
  });
});

describe("acceptance email", () => {
  it("carries the code, what it signs, and the amount", () => {
    const { subject, text } = acceptanceEmail({
      name: "Cara Captain",
      code: "123456",
      jobCode: "D.0130.05",
      jobTitle: "Valve overhaul",
      amount: "€1,485",
    });
    expect(subject).toContain("D.0130.05");
    expect(text).toContain("123456");
    expect(text).toContain("Valve overhaul");
    expect(text).toContain("€1,485");
    expect(text).toContain(String(CHALLENGE_TTL_MINUTES));
  });

  it("tells a recipient who did not start it what to do", () => {
    const { text } = acceptanceEmail({
      name: "X", code: "000000", jobCode: "D.1", jobTitle: "T", amount: "€1",
    });
    expect(text).toMatch(/did not start this/i);
    expect(text).toMatch(/do not enter the code/i);
  });
});
