import { describe, it, expect } from "vitest";
import {
  ACTION_ERROR_TITLE,
  ActionError,
  conflict,
  decodeActionError,
  forbidden,
  invalid,
  isActionError,
  notFound,
} from "@/lib/errors";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";

describe("ActionError", () => {
  it("is an Error, so an unconverted catch still works", () => {
    expect(forbidden()).toBeInstanceOf(Error);
    expect(isActionError(forbidden())).toBe(true);
    expect(isActionError(new Error("plain"))).toBe(false);
  });

  it("carries the message it was given", () => {
    expect(invalid("Quantity must be a number.").message).toBe("Quantity must be a number.");
  });

  it("has a title for every kind", () => {
    for (const kind of ["forbidden", "not-found", "invalid", "conflict"] as const) {
      expect(ACTION_ERROR_TITLE[kind].length).toBeGreaterThan(0);
    }
  });
});

describe("the digest, which is the only thing production preserves", () => {
  it("round-trips kind and message across the server/client boundary", () => {
    const err = forbidden("You cannot decide the CAPTAIN approval.");
    // The boundary receives a bare object, not the class — this is what Next
    // hands the client component in production.
    expect(decodeActionError({ digest: err.digest })).toEqual({
      kind: "forbidden",
      message: "You cannot decide the CAPTAIN approval.",
    });
  });

  it("round-trips every kind", () => {
    const cases = [forbidden(), notFound("That job"), invalid("Bad input"), conflict()];
    for (const err of cases) {
      const decoded = decodeActionError({ digest: err.digest });
      expect(decoded?.kind).toBe(err.kind);
      expect(decoded?.message).toBe(err.message);
    }
  });

  it("survives a message containing the separator and percent signs", () => {
    const err = invalid("Use | or 50% — not both.");
    expect(decodeActionError({ digest: err.digest })?.message).toBe("Use | or 50% — not both.");
  });

  it("survives a message containing a newline", () => {
    const err = invalid("Line one.\nLine two.");
    expect(decodeActionError({ digest: err.digest })?.message).toBe("Line one.\nLine two.");
  });

  it("refuses a digest this application did not write", () => {
    // Next's own hashed digest for an unexpected exception.
    expect(decodeActionError({ digest: "1094378234" })).toBeNull();
    expect(decodeActionError({ digest: "NEXT_NOT_FOUND" })).toBeNull();
    expect(decodeActionError({ digest: "NEXT_REDIRECT;replace;/login;307;" })).toBeNull();
  });

  it("refuses a forged digest naming a kind that does not exist", () => {
    expect(decodeActionError({ digest: "OC_ERR|admin|You%20are%20an%20admin" })).toBeNull();
  });

  it("refuses a malformed digest rather than throwing", () => {
    expect(decodeActionError({ digest: "OC_ERR|forbidden" })).toBeNull();
    expect(decodeActionError({ digest: "OC_ERR|forbidden|%E0%A4%A" })).toBeNull();
    expect(decodeActionError({ digest: "" })).toBeNull();
    expect(decodeActionError({})).toBeNull();
    expect(decodeActionError(null)).toBeNull();
    expect(decodeActionError(undefined)).toBeNull();
  });

  it("gives an empty message back rather than null", () => {
    expect(decodeActionError({ digest: new ActionError("invalid", "").digest })).toEqual({
      kind: "invalid",
      message: "",
    });
  });
});

describe("the helpers' default messages", () => {
  it("never name a permission key", () => {
    // The whole point: a denial tells the user what they may not do, not what
    // the permission model is called. A key looks like `change_order.view`.
    const KEY = /\b[a-z_]+\.[a-z_]+\b/;
    expect(forbidden().message).not.toMatch(KEY);
    expect(forbidden("You cannot decide the CAPTAIN approval.").message).not.toMatch(KEY);

    // And the real call site, which is what actually matters.
    const raised = (() => {
      try {
        assertPermission(
          { permissions: new Set<string>(), roleKeys: [] } as never,
          PERMISSIONS.CO_APPROVE_CAPTAIN
        );
      } catch (err) {
        return err as Error;
      }
      throw new Error("assertPermission did not refuse");
    })();
    expect(isActionError(raised)).toBe(true);
    expect(raised.message).not.toContain(PERMISSIONS.CO_APPROVE_CAPTAIN);
    expect(raised.message).not.toMatch(KEY);
  });

  it("phrases not-found around the thing, not the query", () => {
    expect(notFound("That change order").message).toBe("That change order could not be found.");
  });

  it("tells the user what to do about a conflict", () => {
    expect(conflict().message).toMatch(/reload/i);
  });
});
