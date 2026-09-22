import { describe, it, expect } from "vitest";
import {
  JOB_ACCEPTED_STATUSES,
  JOB_CANCELLED_STATUSES,
  JOB_LEGAL_TRANSITIONS,
  JOB_PENDING_STATUSES,
  JOB_TERMINAL_STATUSES,
  JOB_TRANSITION_PERMISSION,
  JOB_TRANSITIONS_REQUIRING_CEREMONY,
  assertTransitionJob,
  canTransitionJob,
  daysUntilExpiry,
  expiryFrom,
  isExpired,
  jobActions,
} from "@/lib/jobs/workflow";
import { JOB_STATUSES, JOB_STATUS_LABELS } from "@/lib/enums";
import { PERMISSIONS } from "@/lib/rbac";
import { isActionError } from "@/lib/errors";

describe("job transition map", () => {
  it("covers every status", () => {
    for (const status of JOB_STATUSES) {
      expect(JOB_LEGAL_TRANSITIONS[status], `missing entry for ${status}`).toBeDefined();
      expect(JOB_TRANSITION_PERMISSION[status], `missing permission for ${status}`).toBeTruthy();
      expect(JOB_STATUS_LABELS[status], `missing label for ${status}`).toBeTruthy();
    }
  });

  it("only targets known statuses", () => {
    for (const [from, targets] of Object.entries(JOB_LEGAL_TRANSITIONS)) {
      for (const to of targets) expect(JOB_STATUSES, `${from} → ${to}`).toContain(to);
    }
  });

  it("never transitions a status to itself", () => {
    for (const [from, targets] of Object.entries(JOB_LEGAL_TRANSITIONS)) {
      expect(targets, `${from} → ${from}`).not.toContain(from);
    }
  });

  it("seals the terminal statuses", () => {
    for (const status of JOB_TERMINAL_STATUSES) {
      expect(JOB_LEGAL_TRANSITIONS[status], status).toEqual([]);
    }
  });

  it("walks the documented happy path", () => {
    const path = [
      "NEW_REQUEST",
      "QUOTE_SENT",
      "CLIENT_ACCEPTED",
      "ACCEPTED",
      "YARD_COMPLETED",
      "WORKS_ACCEPTED",
      "CLOSED",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionJob(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it("lets an expired quote still be accepted", () => {
    // The Bridge allows this: the yard then decides whether to countersign.
    expect(canTransitionJob("EXPIRED", "CLIENT_ACCEPTED")).toBe(true);
  });

  it("routes a deficiency back to works accepted once resolved", () => {
    expect(canTransitionJob("YARD_COMPLETED", "MINOR_DEFICIENCY")).toBe(true);
    expect(canTransitionJob("MINOR_DEFICIENCY", "WORKS_ACCEPTED")).toBe(true);
  });

  it("refuses to skip the yard countersign", () => {
    expect(canTransitionJob("CLIENT_ACCEPTED", "YARD_COMPLETED")).toBe(false);
  });

  it("refuses to complete work that was never accepted", () => {
    expect(canTransitionJob("QUOTE_SENT", "YARD_COMPLETED")).toBe(false);
    expect(canTransitionJob("NEW_REQUEST", "ACCEPTED")).toBe(false);
  });

  it("refuses to reopen a cancelled quote", () => {
    expect(canTransitionJob("CANCELLED_QUOTE", "QUOTE_SENT")).toBe(false);
    expect(() => assertTransitionJob("CANCELLED_QUOTE", "QUOTE_SENT")).toThrow(/can no longer move/);
  });

  it("throws an ActionError of kind conflict, not a bare Error (ACTION_PLAN.md G3.6)", () => {
    try {
      assertTransitionJob("CANCELLED_QUOTE", "QUOTE_SENT");
      expect.unreachable();
    } catch (e) {
      expect(isActionError(e)).toBe(true);
      expect((e as { kind?: string }).kind).toBe("conflict");
    }
  });

  it("cannot cancel a quote once work is accepted; that is cancelling works", () => {
    expect(canTransitionJob("ACCEPTED", "CANCELLED_QUOTE")).toBe(false);
    expect(canTransitionJob("ACCEPTED", "CANCELLED_WORKS")).toBe(true);
  });
});

describe("money buckets", () => {
  it("classifies every status exactly once", () => {
    const buckets = [
      ...JOB_ACCEPTED_STATUSES,
      ...JOB_PENDING_STATUSES,
      ...JOB_CANCELLED_STATUSES,
    ];
    for (const status of JOB_STATUSES) {
      if (status === "CLIENT_ACCEPTED") continue; // in flight between the two
      expect(buckets.filter((s) => s === status), `${status}`).toHaveLength(1);
    }
  });

  it("does not count cancelled work as accepted", () => {
    for (const status of JOB_CANCELLED_STATUSES) {
      expect(JOB_ACCEPTED_STATUSES).not.toContain(status);
    }
  });

  it("counts an expired quote as still pending, not lost", () => {
    expect(JOB_PENDING_STATUSES).toContain("EXPIRED");
  });
});

describe("expiry", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("computes the lapse date from the validity", () => {
    const delivered = new Date("2026-06-01T00:00:00Z");
    expect(expiryFrom(delivered, 5)?.toISOString()).toBe("2026-06-06T00:00:00.000Z");
  });

  it("has no lapse date without a validity", () => {
    expect(expiryFrom(new Date(), null)).toBeNull();
    expect(expiryFrom(new Date(), 0)).toBeNull();
  });

  it("marks a lapsed quote expired", () => {
    expect(isExpired({ status: "QUOTE_SENT", expiresAt: new Date("2026-05-30T00:00:00Z") }, now)).toBe(true);
  });

  it("leaves a live quote alone", () => {
    expect(isExpired({ status: "QUOTE_SENT", expiresAt: new Date("2026-06-10T00:00:00Z") }, now)).toBe(false);
  });

  it("never expires a quote with no validity set", () => {
    expect(isExpired({ status: "QUOTE_SENT", expiresAt: null }, now)).toBe(false);
  });

  it("never expires a job that is already accepted", () => {
    expect(isExpired({ status: "ACCEPTED", expiresAt: new Date("2026-01-01T00:00:00Z") }, now)).toBe(false);
  });

  it("counts the days left, going negative once lapsed", () => {
    expect(daysUntilExpiry(new Date("2026-06-06T12:00:00Z"), now)).toBe(5);
    expect(daysUntilExpiry(new Date("2026-05-30T12:00:00Z"), now)).toBe(-2);
    expect(daysUntilExpiry(null, now)).toBeNull();
  });
});

describe("offered actions", () => {
  it("only offers legal transitions", () => {
    for (const status of JOB_STATUSES) {
      for (const action of jobActions(status)) {
        expect(canTransitionJob(status, action.to), `${status} → ${action.to}`).toBe(true);
      }
    }
  });

  it("never offers expiry or accept as a plain button", () => {
    // Expiry is the clock's job; accepting runs through a confirmation and code.
    for (const status of JOB_STATUSES) {
      const targets = jobActions(status).map((a) => a.to);
      expect(targets).not.toContain("EXPIRED");
      expect(targets).not.toContain("CLIENT_ACCEPTED");
    }
  });

  it("offers nothing on a terminal job", () => {
    for (const status of JOB_TERMINAL_STATUSES) {
      expect(jobActions(status), status).toEqual([]);
    }
  });

  it("gives every action a label, a permission and a side", () => {
    for (const status of JOB_STATUSES) {
      for (const action of jobActions(status)) {
        expect(action.label.length).toBeGreaterThan(0);
        expect(action.permission.length).toBeGreaterThan(0);
        expect(["client", "yard"]).toContain(action.side);
      }
    }
  });

  it("puts countersigning on the yard and works acceptance on the client", () => {
    expect(jobActions("CLIENT_ACCEPTED").find((a) => a.to === "ACCEPTED")?.side).toBe("yard");
    expect(jobActions("YARD_COMPLETED").find((a) => a.to === "WORKS_ACCEPTED")?.side).toBe("client");
  });

  it("requires the accept permission to accept, and countersign to countersign", () => {
    expect(JOB_TRANSITION_PERMISSION.CLIENT_ACCEPTED).toBe(PERMISSIONS.JOB_ACCEPT);
    expect(JOB_TRANSITION_PERMISSION.ACCEPTED).toBe(PERMISSIONS.JOB_COUNTERSIGN);
  });
});

describe("separation of duties on a job", () => {
  it("never lets one permission both issue a quote and accept it", () => {
    expect(PERMISSIONS.JOB_ISSUE_QUOTE).not.toBe(PERMISSIONS.JOB_ACCEPT);
    expect(PERMISSIONS.JOB_ACCEPT).not.toBe(PERMISSIONS.JOB_COUNTERSIGN);
  });
});

describe("JOB_TRANSITIONS_REQUIRING_CEREMONY", () => {
  it("names CLIENT_ACCEPTED — the C2 fix", () => {
    // transitionJob refuses any status in this list outright, regardless of
    // permission or legality, so it can never be used to shortcut the
    // confirmation-code ceremony in jobs/[id]/accept/actions.ts.
    expect(JOB_TRANSITIONS_REQUIRING_CEREMONY).toContain("CLIENT_ACCEPTED");
  });

  it("is a real subset of the legal transition map, not a status nobody could reach anyway", () => {
    // If this list named a status the map never targets, it would prove
    // nothing — the whole point is that CLIENT_ACCEPTED IS a legal target
    // (from QUOTE_SENT and EXPIRED) and still must be refused.
    const allTargets = new Set(Object.values(JOB_LEGAL_TRANSITIONS).flat());
    for (const status of JOB_TRANSITIONS_REQUIRING_CEREMONY) {
      expect(allTargets, status).toContain(status);
    }
  });

  it("does not name EXPIRED — that exclusion from jobActions is a UI choice, not a security one", () => {
    expect(JOB_TRANSITIONS_REQUIRING_CEREMONY).not.toContain("EXPIRED");
  });
});
