import { describe, it, expect } from "vitest";
import {
  CR_LEGAL_TRANSITIONS,
  CR_TRANSITION_PERMISSION,
  CR_TERMINAL_STATUSES,
  CR_GENERIC_UNREACHABLE,
  canTransitionCrewRequest,
  assertTransitionCrewRequest,
  crewRequestActions,
} from "@/lib/workflow/crewRequest";
import { CREW_REQUEST_STATUSES } from "@/lib/enums";
import { PERMISSIONS } from "@/lib/rbac";

describe("crew request legal transitions", () => {
  it("covers every status", () => {
    for (const status of CREW_REQUEST_STATUSES) {
      expect(CR_LEGAL_TRANSITIONS[status], `missing map entry for ${status}`).toBeDefined();
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

  it("leaves terminal statuses with no way out", () => {
    for (const status of CR_TERMINAL_STATUSES) {
      expect(CR_LEGAL_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("allows the documented happy path", () => {
    const path = ["NEW", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CLOSED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionCrewRequest(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(
        true
      );
    }
  });

  it("rejects reopening a closed request", () => {
    expect(canTransitionCrewRequest("CLOSED", "NEW")).toBe(false);
    expect(() => assertTransitionCrewRequest("CLOSED", "NEW")).toThrow(/Illegal transition/);
  });

  it("lets a rejected request be reopened, and only to NEW", () => {
    expect(canTransitionCrewRequest("REJECTED", "NEW")).toBe(true);
    expect(canTransitionCrewRequest("REJECTED", "ASSIGNED")).toBe(false);
  });

  it("rejects skipping straight from NEW to IN_PROGRESS", () => {
    expect(canTransitionCrewRequest("NEW", "IN_PROGRESS")).toBe(false);
  });
});

describe("transition permissions", () => {
  it("maps every status to a permission, with no gaps", () => {
    for (const status of CREW_REQUEST_STATUSES) {
      expect(CR_TRANSITION_PERMISSION[status], `status ${status}`).toBeTruthy();
    }
  });

  it("requires triage to reject, block, or move work along", () => {
    expect(CR_TRANSITION_PERMISSION.IN_PROGRESS).toBe(PERMISSIONS.CR_TRIAGE);
    expect(CR_TRANSITION_PERMISSION.BLOCKED).toBe(PERMISSIONS.CR_TRIAGE);
    expect(CR_TRANSITION_PERMISSION.AWAITING_APPROVAL).toBe(PERMISSIONS.CR_TRIAGE);
    expect(CR_TRANSITION_PERMISSION.REJECTED).toBe(PERMISSIONS.CR_TRIAGE);
  });

  it("requires the complete permission to finish or close", () => {
    expect(CR_TRANSITION_PERMISSION.COMPLETED).toBe(PERMISSIONS.CR_COMPLETE);
    expect(CR_TRANSITION_PERMISSION.CLOSED).toBe(PERMISSIONS.CR_COMPLETE);
  });

  it("has nothing reachable only through a separate ceremony", () => {
    expect(CR_GENERIC_UNREACHABLE).toEqual([]);
  });
});

describe("offered actions", () => {
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

  it("labels resuming from blocked and awaiting-approval distinctly", () => {
    expect(crewRequestActions("BLOCKED").find((a) => a.to === "IN_PROGRESS")?.label).toBe(
      "Resume Work"
    );
    expect(crewRequestActions("AWAITING_APPROVAL").find((a) => a.to === "IN_PROGRESS")?.label).toBe(
      "Back to Work"
    );
  });

  it("marks only reject as a danger action", () => {
    for (const status of CREW_REQUEST_STATUSES) {
      for (const action of crewRequestActions(status)) {
        if (action.to === "REJECTED") expect(action.tone).toBe("danger");
        else expect(action.tone).toBe("primary");
      }
    }
  });

  it("gives every action a label and a permission", () => {
    for (const status of CREW_REQUEST_STATUSES) {
      for (const action of crewRequestActions(status)) {
        expect(action.label.length).toBeGreaterThan(0);
        expect(action.permission.length).toBeGreaterThan(0);
      }
    }
  });
});
