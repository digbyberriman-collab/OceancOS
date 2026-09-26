import { describe, it, expect } from "vitest";
import { applyTransition, type StatusUpdatable } from "@/lib/workflow/transition";
import { isActionError } from "@/lib/errors";

/**
 * A tiny in-memory stand-in for a Prisma model delegate, faithful to the one
 * behaviour this module depends on: `updateMany` only touches rows matching
 * every key in `where`, and reports how many it touched.
 */
function fakeModel(rows: Record<string, unknown>[]): StatusUpdatable & { rows: Record<string, unknown>[] } {
  return {
    rows,
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of rows) {
        if (Object.entries(where).every(([k, v]) => row[k] === v)) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    },
  };
}

describe("applyTransition", () => {
  it("writes the new status when the row still has the status the caller read", async () => {
    const model = fakeModel([{ id: "j1", status: "QUOTE_SENT" }]);
    await applyTransition(model, { id: "j1", from: "QUOTE_SENT", to: "CLIENT_ACCEPTED" });
    expect(model.rows[0].status).toBe("CLIENT_ACCEPTED");
  });

  it("merges extra data in alongside the status", async () => {
    const model = fakeModel([{ id: "j1", status: "QUOTE_SENT", yardAcceptedAt: null }]);
    await applyTransition(model, {
      id: "j1",
      from: "QUOTE_SENT",
      to: "ACCEPTED",
      data: { yardAcceptedAt: "2026-01-01", updatedById: "u1" },
    });
    expect(model.rows[0]).toMatchObject({
      status: "ACCEPTED",
      yardAcceptedAt: "2026-01-01",
      updatedById: "u1",
    });
  });

  it("throws a conflict and writes nothing when the row has already moved on", async () => {
    // Two requests read QUOTE_SENT; one wins the race and moves it to
    // CANCELLED_QUOTE before the second one's write lands.
    const model = fakeModel([{ id: "j1", status: "CANCELLED_QUOTE" }]);
    await expect(
      applyTransition(model, { id: "j1", from: "QUOTE_SENT", to: "CLIENT_ACCEPTED" })
    ).rejects.toSatisfy(isActionError);
    expect(model.rows[0].status).toBe("CANCELLED_QUOTE");
  });

  it("throws a conflict for a row that no longer exists", async () => {
    const model = fakeModel([]);
    await expect(
      applyTransition(model, { id: "gone", from: "QUOTE_SENT", to: "CLIENT_ACCEPTED" })
    ).rejects.toSatisfy(isActionError);
  });

  it("the conflict tells the user what to do", async () => {
    const model = fakeModel([{ id: "j1", status: "CANCELLED_QUOTE" }]);
    try {
      await applyTransition(model, { id: "j1", from: "QUOTE_SENT", to: "CLIENT_ACCEPTED" });
      expect.unreachable();
    } catch (err) {
      expect(isActionError(err)).toBe(true);
      expect((err as Error).message).toMatch(/reload/i);
    }
  });

  it("only touches the row it was asked to, not others at the same from-status", async () => {
    const model = fakeModel([
      { id: "j1", status: "QUOTE_SENT" },
      { id: "j2", status: "QUOTE_SENT" },
    ]);
    await applyTransition(model, { id: "j1", from: "QUOTE_SENT", to: "CLIENT_ACCEPTED" });
    expect(model.rows[0].status).toBe("CLIENT_ACCEPTED");
    expect(model.rows[1].status).toBe("QUOTE_SENT");
  });

  it("respects a custom status field name", async () => {
    const model = fakeModel([{ id: "co1", stage: "PENDING" }]);
    await applyTransition(model, {
      id: "co1",
      from: "PENDING",
      to: "APPROVED",
      statusField: "stage",
    });
    expect(model.rows[0].stage).toBe("APPROVED");
  });
});
