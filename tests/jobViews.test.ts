import { describe, it, expect } from "vitest";
import { JOB_VIEWS, viewCountsFromGroups, type JobStatusContractGroup } from "@/lib/jobs/views";

function group(status: string, contractType: string, count: number): JobStatusContractGroup {
  return { status, contractType, _count: { _all: count } };
}

describe("viewCountsFromGroups", () => {
  it("sums a whole-project groupBy into each view's count (ACTION_PLAN.md G4.2)", () => {
    const groups = [
      group("NEW_REQUEST", "LABOUR", 3),
      group("QUOTE_SENT", "LABOUR", 5),
      group("QUOTE_SENT", "PURCHASE", 2),
      group("ACCEPTED", "LABOUR", 1),
      group("CANCELLED_WORKS", "LABOUR", 4),
      group("CANCELLED_QUOTE", "LABOUR", 1),
    ];
    const counts = viewCountsFromGroups(groups);

    expect(counts.get("requests")).toBe(3);
    // pending: QUOTE_SENT + EXPIRED, any contract type
    expect(counts.get("pending")).toBe(7);
    // purchases: NEW_REQUEST|QUOTE_SENT|EXPIRED AND contractType === PURCHASE
    expect(counts.get("purchases")).toBe(2);
    expect(counts.get("accepted")).toBe(1);
    expect(counts.get("cancelled-works")).toBe(4);
    expect(counts.get("cancelled-quotes")).toBe(1);
    // worklist: every status, every contract type
    expect(counts.get("worklist")).toBe(16);
  });

  it("has an entry for every declared view, even with no data at all", () => {
    const counts = viewCountsFromGroups([]);
    for (const v of JOB_VIEWS) {
      expect(counts.get(v.key), v.key).toBe(0);
    }
  });

  it("never lets a purchase job double-count into the plain requests/pending views", () => {
    // A NEW_REQUEST purchase job counts toward "requests" and "purchases" —
    // that overlap is intentional (The Bridge's own view design) — but a
    // group must never appear in a view whose predicate it doesn't match.
    const groups = [group("NEW_REQUEST", "PURCHASE", 1)];
    const counts = viewCountsFromGroups(groups);
    expect(counts.get("requests")).toBe(1);
    expect(counts.get("purchases")).toBe(1);
    expect(counts.get("pending")).toBe(0);
    expect(counts.get("cancelled-quotes")).toBe(0);
  });
});
