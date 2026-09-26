import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, hasPermission, hasAnyRole, assertPermission } from "@/lib/rbac";
import { ROLE_KEYS } from "@/lib/enums";
import { ActionError } from "@/lib/errors";

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

function fakeUser(perms: string[], roleKeys: string[] = []) {
  return {
    id: "u1",
    email: "u@example.com",
    name: "Test User",
    roles: [],
    roleKeys,
    permissions: new Set(perms),
  } as any;
}

describe("role/permission matrix", () => {
  it("defines a permission set for every role", () => {
    for (const role of ROLE_KEYS) {
      expect(ROLE_PERMISSIONS[role], `missing matrix entry for ${role}`).toBeDefined();
    }
  });

  it("only grants permissions that exist", () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        expect(ALL_PERMISSIONS, `${role} grants unknown permission ${perm}`).toContain(perm);
      }
    }
  });

  it("grants no permission twice within a role", () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(new Set(perms).size, `${role} has duplicate grants`).toBe(perms.length);
    }
  });

  it("gives every role at least one permission", () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(perms.length, `${role} has no permissions`).toBeGreaterThan(0);
    }
  });
});

describe("separation of duties", () => {
  it("keeps financial data away from crew", () => {
    expect(ROLE_PERMISSIONS.CREW).not.toContain(PERMISSIONS.FIN_VIEW);
    expect(ROLE_PERMISSIONS.CREW).not.toContain(PERMISSIONS.FIN_EDIT_BUDGET);
  });

  it("does not let the owner approve technical stages", () => {
    expect(ROLE_PERMISSIONS.OWNER).not.toContain(PERMISSIONS.CO_APPROVE_TECH);
    expect(ROLE_PERMISSIONS.OWNER).not.toContain(PERMISSIONS.DRW_APPROVE);
  });

  it("keeps the auditor read-only", () => {
    const writeish = [
      PERMISSIONS.CO_CREATE,
      PERMISSIONS.CO_EDIT,
      PERMISSIONS.CO_SUBMIT,
      PERMISSIONS.CO_CANCEL,
      PERMISSIONS.CR_CREATE,
      PERMISSIONS.FIN_EDIT_BUDGET,
      PERMISSIONS.SCH_EDIT,
      PERMISSIONS.INV_EDIT,
      PERMISSIONS.RSK_EDIT,
      PERMISSIONS.ADM_USERS,
    ];
    for (const perm of writeish) {
      expect(ROLE_PERMISSIONS.AUDITOR, `auditor should not hold ${perm}`).not.toContain(perm);
    }
  });

  it("restricts confidential documents to a small set of roles", () => {
    const holders = ROLE_KEYS.filter((r) =>
      ROLE_PERMISSIONS[r].includes(PERMISSIONS.DOC_VIEW_CONFIDENTIAL)
    );
    expect(holders.sort()).toEqual(["FINANCE", "OWNER", "OWNERS_REP"]);
  });

  it("gives each approval stage to at least one role", () => {
    const stagePerms = [
      PERMISSIONS.CO_APPROVE_CAPTAIN,
      PERMISSIONS.CO_APPROVE_OWNERS_REP,
      PERMISSIONS.CO_APPROVE_YARD,
      PERMISSIONS.CO_APPROVE_FINANCE,
      PERMISSIONS.CO_APPROVE_TECH,
      PERMISSIONS.CO_APPROVE_CLASS,
      PERMISSIONS.CO_APPROVE_FLAG,
    ];
    for (const perm of stagePerms) {
      const holders = ROLE_KEYS.filter((r) => ROLE_PERMISSIONS[r].includes(perm));
      expect(holders.length, `nobody can decide ${perm}`).toBeGreaterThan(0);
    }
  });

  it("does not let one role hold every approval stage", () => {
    const stagePerms = [
      PERMISSIONS.CO_APPROVE_CAPTAIN,
      PERMISSIONS.CO_APPROVE_OWNERS_REP,
      PERMISSIONS.CO_APPROVE_YARD,
      PERMISSIONS.CO_APPROVE_FINANCE,
      PERMISSIONS.CO_APPROVE_TECH,
    ];
    for (const role of ROLE_KEYS) {
      const held = stagePerms.filter((p) => ROLE_PERMISSIONS[role].includes(p));
      expect(held.length, `${role} can rubber-stamp the whole chain`).toBeLessThan(stagePerms.length);
    }
  });

  it("lets the captain run a crew request end to end, including raising one", () => {
    for (const perm of [
      PERMISSIONS.CR_VIEW,
      PERMISSIONS.CR_CREATE,
      PERMISSIONS.CR_TRIAGE,
      PERMISSIONS.CR_ASSIGN,
      PERMISSIONS.CR_COMPLETE,
    ]) {
      expect(ROLE_PERMISSIONS.CAPTAIN, `captain should hold ${perm}`).toContain(perm);
    }
  });

  it("restricts contractors and suppliers to a narrow surface", () => {
    expect(ROLE_PERMISSIONS.SUPPLIER.length).toBeLessThanOrEqual(3);
    expect(ROLE_PERMISSIONS.CONTRACTOR).not.toContain(PERMISSIONS.FIN_VIEW);
    expect(ROLE_PERMISSIONS.CONTRACTOR).not.toContain(PERMISSIONS.CON_EDIT);
  });
});

describe("permission checks", () => {
  it("passes when the user holds the permission", () => {
    expect(hasPermission(fakeUser([PERMISSIONS.CO_VIEW]), PERMISSIONS.CO_VIEW)).toBe(true);
  });

  it("fails when the user does not", () => {
    expect(hasPermission(fakeUser([PERMISSIONS.CO_VIEW]), PERMISSIONS.FIN_VIEW)).toBe(false);
  });

  it("throws, without naming the key it is missing", () => {
    // This test used to assert the opposite. The message reaches the browser
    // via the error digest, and naming `financial.view` in it would describe
    // the permission model to anyone who probes for a denial.
    expect(() => assertPermission(fakeUser([]), PERMISSIONS.FIN_VIEW)).toThrow(ActionError);
    expect(() => assertPermission(fakeUser([]), PERMISSIONS.FIN_VIEW)).not.toThrow(
      /financial\.view/
    );

    try {
      assertPermission(fakeUser([]), PERMISSIONS.FIN_VIEW);
    } catch (err) {
      expect((err as ActionError).kind).toBe("forbidden");
      expect((err as Error).message).toBe("You do not have permission to do that.");
    }
  });

  it("matches roles by key", () => {
    const user = fakeUser([], ["CAPTAIN"]);
    expect(hasAnyRole(user, "CAPTAIN")).toBe(true);
    expect(hasAnyRole(user, "OWNER", "FINANCE")).toBe(false);
    expect(hasAnyRole(user, "OWNER", "CAPTAIN")).toBe(true);
  });
});
