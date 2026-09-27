import { describe, it, expect } from "vitest";
import {
  CR_LEGAL_TRANSITIONS,
  CR_TERMINAL_STATUSES,
  CR_TRANSITION_PERMISSION,
  assertTransitionCrewRequest,
  canTransitionCrewRequest,
  crewRequestActions,
} from "@/lib/workflow/crewRequest";
import { CREW_REQUEST_STATUSES } from "@/lib/enums";
import { PERMISSIONS } from "@/lib/rbac";
import { isActionError } from "@/lib/errors";

describe("crew request legal transitions", () => {
  it("covers every status", () => {
    for (const status of CREW_REQUEST_STATUSES) {
      expect(CR_LEGAL_TRANSITIONS[status], `missing entry for ${status}`).toBeDefined();
      expect(CR_TRANSITION_PERMISSION[status], `missing permission for ${status}`).toBeTruthy();
    }
  });

  it("only ever targets a known status", () => {
    for (const [from, targets] of Object.entries(CR_LEGAL_TRANSITIONS)) {
      for (const to of targets) {
        expect(CREW_REQUEST_STATUSES, `${from} → ${to}`).toContain(to);
      }
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const [from, targets] of Object.entries(CR_LEGAL_TRANSITIONS)) {
      expect(targets, `${from} → ${from}`).not.toContain(from);
    }
  });

  it("seals the terminal status", () => {
    for (const status of CR_TERMINAL_STATUSES) {
      expect(CR_LEGAL_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("rejects reopening from anywhere but REJECTED", () => {
    expect(canTransitionCrewRequest("CLOSED", "NEW")).toBe(false);
    expect(() => assertTransitionCrewRequest("CLOSED", "NEW")).toThrow(/can no longer move/);
  });

  it("throws an ActionError of kind conflict, not a bare Error (ACTION_PLAN.md G3.6)", () => {
    try {
      assertTransitionCrewRequest("CLOSED", "NEW");
      expect.unreachable();
    } catch (e) {
      expect(isActionError(e)).toBe(true);
      expect((e as { kind?: string }).kind).toBe("conflict");
    }
  });

  it("lets a rejected request be reopened", () => {
    expect(canTransitionCrewRequest("REJECTED", "NEW")).toBe(true);
  });
});

describe("CR_TRANSITION_PERMISSION — the C6 fix", () => {
  it("covers all five previously-unchecked targets, not only the original four", () => {
    // Before G2.4, transitionCrewRequest's if/else chain checked only
    // TRIAGED, ASSIGNED (→ CR_TRIAGE) and COMPLETED, CLOSED (→ CR_COMPLETE).
    // IN_PROGRESS, BLOCKED, AWAITING_APPROVAL, REJECTED and NEW fell through
    // with no check at all. This is a Record, so TypeScript itself refuses
    // to compile a map missing an entry — but assert it explicitly too.
    for (const status of CREW_REQUEST_STATUSES) {
      expect(CR_TRANSITION_PERMISSION[status]).toBeTruthy();
    }
    for (const status of ["IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "REJECTED", "NEW"] as const) {
      expect(CR_TRANSITION_PERMISSION[status]).toBe(PERMISSIONS.CR_TRIAGE);
    }
  });

  it("requires the triage permission for triage-like moves", () => {
    expect(CR_TRANSITION_PERMISSION.TRIAGED).toBe(PERMISSIONS.CR_TRIAGE);
    expect(CR_TRANSITION_PERMISSION.ASSIGNED).toBe(PERMISSIONS.CR_TRIAGE);
  });

  it("requires the completion permission to complete or close", () => {
    expect(CR_TRANSITION_PERMISSION.COMPLETED).toBe(PERMISSIONS.CR_COMPLETE);
    expect(CR_TRANSITION_PERMISSION.CLOSED).toBe(PERMISSIONS.CR_COMPLETE);
  });
});

describe("crewRequestActions", () => {
  it("offers only legal transitions", () => {
    for (const status of CREW_REQUEST_STATUSES) {
      for (const action of crewRequestActions(status)) {
        expect(canTransitionCrewRequest(status, action.to), `${status} → ${action.to}`).toBe(true);
      }
    }
  });

  it("offers nothing on a closed request", () => {
    expect(crewRequestActions("CLOSED")).toEqual([]);
  });

  it("gives every action a label and a permission", () => {
    for (const status of CREW_REQUEST_STATUSES) {
      for (const action of crewRequestActions(status)) {
        expect(action.label.length).toBeGreaterThan(0);
        expect(action.permission.length).toBeGreaterThan(0);
      }
    }
  });

  it("marks only reject as a danger action", () => {
    for (const status of CREW_REQUEST_STATUSES) {
      for (const action of crewRequestActions(status)) {
        expect(action.tone).toBe(action.to === "REJECTED" ? "danger" : "primary");
      }
    }
  });

  it("labels resuming from blocked distinctly from starting fresh", () => {
    expect(crewRequestActions("BLOCKED").find((a) => a.to === "IN_PROGRESS")?.label).toBe("Resume Work");
    expect(crewRequestActions("ASSIGNED").find((a) => a.to === "IN_PROGRESS")?.label).toBe("Start Work");
    expect(crewRequestActions("AWAITING_APPROVAL").find((a) => a.to === "IN_PROGRESS")?.label).toBe(
      "Back to Work"
    );
  });
});
