import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/lib/rbac";
import { isActionError } from "@/lib/errors";

// C17: every step of the acceptance ceremony checked only that the caller
// held JOB_ACCEPT (or, for rejectQuote, JOB_CANCEL) — never that the caller
// was the specific job's own designatedAuthoriserId. These tests call the
// three real exported actions directly, the way a request reaching the
// server would, to prove each one now refuses a signer the quote was not
// addressed to, without relying on the UI ever hiding a button.

const {
  requireUser,
  jobFindUnique,
  listProjectsForUser,
  acceptanceChallengeFindUnique,
  acceptanceChallengeUpdateMany,
  transaction,
  redirect,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  jobFindUnique: vi.fn(),
  listProjectsForUser: vi.fn(),
  acceptanceChallengeFindUnique: vi.fn(),
  acceptanceChallengeUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  transaction: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("unexpected redirect");
  }),
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    job: { findUnique: jobFindUnique, update: vi.fn().mockResolvedValue({}) },
    acceptanceChallenge: {
      findUnique: acceptanceChallengeFindUnique,
      updateMany: acceptanceChallengeUpdateMany,
      create: vi.fn(),
      update: vi.fn(),
    },
    changeOrder: { findUnique: vi.fn() },
    jobHistory: { create: vi.fn().mockResolvedValue({}) },
    comment: { create: vi.fn().mockResolvedValue({}) },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/project", () => ({ listProjectsForUser, usersReachingProject: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

import { requestAcceptanceCode, confirmAcceptance, rejectQuote } from "@/app/(app)/jobs/[id]/accept/actions";

function fakeUser(id: string, perms: string[]) {
  return {
    id,
    email: `${id}@example.com`,
    name: "Test User",
    roles: [],
    roleKeys: [],
    permissions: new Set(perms),
  } as any;
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const baseJob = {
  id: "job1",
  projectId: "p1",
  status: "QUOTE_SENT",
  designatedAuthoriserId: "captain1",
  linkedChangeOrderId: null,
  currency: "EUR",
  total: 1000,
  project: { currency: "EUR" },
};

beforeEach(() => {
  jobFindUnique.mockReset().mockResolvedValue(baseJob);
  listProjectsForUser.mockReset().mockResolvedValue([{ id: "p1" }]);
  acceptanceChallengeFindUnique.mockReset();
  acceptanceChallengeUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  transaction.mockReset();
  redirect.mockClear();
});

describe("requestAcceptanceCode", () => {
  it("refuses an authoriser holding JOB_ACCEPT who is not this job's designated authoriser", async () => {
    requireUser.mockResolvedValue(fakeUser("pm1", [PERMISSIONS.JOB_ACCEPT]));

    const err = await requestAcceptanceCode(formData({ jobId: "job1" })).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("proceeds past the authoriser check for the actual designated authoriser", async () => {
    requireUser.mockResolvedValue(fakeUser("captain1", [PERMISSIONS.JOB_ACCEPT]));

    // No assertion on the rest of the flow (that's covered by
    // tests/jobAcceptance.test.ts) — just that it gets past loadJobForAccept
    // and reaches the real redirect at the end, rather than throwing
    // forbidden.
    const err = await requestAcceptanceCode(formData({ jobId: "job1" })).catch((e) => e);
    expect(isActionError(err)).toBe(false);
  });
});

describe("confirmAcceptance", () => {
  it("refuses a non-designated authoriser before ever checking the code", async () => {
    requireUser.mockResolvedValue(fakeUser("pm1", [PERMISSIONS.JOB_ACCEPT]));

    const err = await confirmAcceptance(
      formData({ jobId: "job1", challengeId: "ch1", code: "123456" })
    ).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(acceptanceChallengeFindUnique).not.toHaveBeenCalled();
  });
});

describe("rejectQuote", () => {
  it("refuses a YARD_PM holding JOB_CANCEL who is not the designated authoriser — the yard cannot produce the client's rejection record", async () => {
    requireUser.mockResolvedValue(fakeUser("yardpm1", [PERMISSIONS.JOB_CANCEL]));

    const err = await rejectQuote(formData({ jobId: "job1", reason: "not needed" })).catch(
      (e) => e
    );

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("still lets the designated authoriser reject their own quote", async () => {
    requireUser.mockResolvedValue(fakeUser("captain1", [PERMISSIONS.JOB_CANCEL]));
    transaction.mockResolvedValue(undefined);

    const err = await rejectQuote(formData({ jobId: "job1", reason: "no longer needed" })).catch(
      (e) => e
    );

    expect(isActionError(err)).toBe(false);
    expect(transaction).toHaveBeenCalled();
  });
});
