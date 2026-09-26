import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/lib/rbac";
import { isActionError } from "@/lib/errors";
import { buildObjectKey } from "@/lib/storage/keys";

// attachUploads (jobs/actions.ts, private) used to trust a client-supplied
// key wholesale — only `typeof row.key === "string"`. A key minted for one
// project's job could be pasted into another project's comment form and
// attached there, then read back through the attachment list
// (auth-security [UPLOADS] — "Attachment records accept arbitrary
// client-supplied storage keys", G2.5). addJobComment is the exported path
// that exercises it with the least other setup, so these tests drive it
// directly, the way a crafted request would.

const {
  requireUser,
  jobFindUnique,
  jobFindMany,
  jobCreate,
  jobSectionFindUnique,
  userFindUnique,
  userFindMany,
  getActiveProject,
  listProjectsForUser,
  commentCreate,
  attachmentCreateMany,
  redirect,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  jobFindUnique: vi.fn(),
  jobFindMany: vi.fn(),
  jobCreate: vi.fn(),
  jobSectionFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  getActiveProject: vi.fn(),
  listProjectsForUser: vi.fn(),
  commentCreate: vi.fn(),
  attachmentCreateMany: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("unexpected redirect");
  }),
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    job: { findUnique: jobFindUnique, findMany: jobFindMany, create: jobCreate },
    jobSection: { findUnique: jobSectionFindUnique },
    user: { findUnique: userFindUnique, findMany: userFindMany },
    comment: { create: commentCreate },
    attachment: { createMany: attachmentCreateMany },
  },
}));
vi.mock("@/lib/project", () => ({
  getActiveProject,
  listProjectsForUser,
  usersReachingProject: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

import { addJobComment, createJobRequest } from "@/app/(app)/jobs/actions";

function fakeUser(perms: string[]) {
  return {
    id: "u1",
    email: "u@example.com",
    name: "Test User",
    roles: [],
    roleKeys: [],
    permissions: new Set(perms),
  } as any;
}

function formData(fields: Record<string, string>, attachments: object[] = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const a of attachments) fd.append("attachments", JSON.stringify(a));
  return fd;
}

const job = { id: "job1", projectId: "p1" };

beforeEach(() => {
  requireUser.mockResolvedValue(fakeUser([PERMISSIONS.JOB_COMMENT, PERMISSIONS.JOB_REQUEST]));
  jobFindUnique.mockReset().mockResolvedValue(job);
  jobFindMany.mockReset().mockResolvedValue([]);
  jobCreate.mockReset().mockResolvedValue({ id: "newjob1" });
  jobSectionFindUnique.mockReset().mockResolvedValue(null);
  userFindUnique.mockReset().mockResolvedValue({
    id: "authoriser1",
    roles: [{ role: { permissions: [{ permission: { key: PERMISSIONS.JOB_ACCEPT } }] } }],
  });
  userFindMany.mockReset().mockResolvedValue([]);
  getActiveProject.mockReset().mockResolvedValue({ id: "p1", currency: "EUR" });
  listProjectsForUser.mockReset().mockResolvedValue([{ id: "p1" }]);
  commentCreate.mockReset().mockResolvedValue({ id: "c1" });
  attachmentCreateMany.mockReset().mockResolvedValue({ count: 0 });
  redirect.mockClear();
});

describe("attachUploads via addJobComment", () => {
  it("refuses a key minted for a different project", async () => {
    const foreignKey = buildObjectKey({
      projectId: "p2",
      resource: "Job",
      resourceId: "job1",
      filename: "photo.jpg",
    });

    const err = await addJobComment(
      formData(
        { jobId: "job1", body: "see attached" },
        [{ key: foreignKey, filename: "photo.jpg", contentType: "image/jpeg", size: 100 }]
      )
    ).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(attachmentCreateMany).not.toHaveBeenCalled();
  });

  it("refuses a key minted for a different job in the same project", async () => {
    const otherJobKey = buildObjectKey({
      projectId: "p1",
      resource: "Job",
      resourceId: "job999",
      filename: "photo.jpg",
    });

    const err = await addJobComment(
      formData(
        { jobId: "job1", body: "see attached" },
        [{ key: otherJobKey, filename: "photo.jpg", contentType: "image/jpeg", size: 100 }]
      )
    ).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(attachmentCreateMany).not.toHaveBeenCalled();
  });

  it("refuses a well-formed key whose declared content type is not on the allowlist", async () => {
    const key = buildObjectKey({
      projectId: "p1",
      resource: "Job",
      resourceId: "job1",
      filename: "script.sh",
    });

    const err = await addJobComment(
      formData(
        { jobId: "job1", body: "see attached" },
        [{ key, filename: "script.sh", contentType: "application/x-sh", size: 100 }]
      )
    ).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("invalid");
    expect(attachmentCreateMany).not.toHaveBeenCalled();
  });

  it("accepts a key genuinely minted for this project and job", async () => {
    const key = buildObjectKey({
      projectId: "p1",
      resource: "Job",
      resourceId: "job1",
      filename: "photo.jpg",
    });

    const err = await addJobComment(
      formData(
        { jobId: "job1", body: "see attached" },
        [{ key, filename: "photo.jpg", contentType: "image/jpeg", size: 100 }]
      )
    ).catch((e) => e);

    expect(err).toBeUndefined();
    expect(attachmentCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ storageKey: key, jobId: "job1" })],
      })
    );
  });
});

describe("attachUploads via createJobRequest — the resourceId:\"new\" placeholder", () => {
  it("accepts a key signed against the placeholder resourceId the create form actually uses, and records it against the real job id", async () => {
    // jobs/new/page.tsx's FileDrop signs with resourceId="new", because the
    // job does not exist yet when the browser asks /api/uploads/sign for a
    // key. Validating against the just-created job.id instead would reject
    // every attachment a real user ever sends from this form.
    const key = buildObjectKey({
      projectId: "p1",
      resource: "Job",
      resourceId: "new",
      filename: "photo.jpg",
    });

    const err = await createJobRequest(
      formData(
        {
          title: "Renew anodes",
          description: "Renew all sacrificial anodes on the rudder stocks.",
          designatedAuthoriserId: "authoriser1",
        },
        [{ key, filename: "photo.jpg", contentType: "image/jpeg", size: 100 }]
      )
    ).catch((e) => e);

    // Reaches the real redirect at the end rather than throwing forbidden.
    expect(isActionError(err)).toBe(false);
    expect(attachmentCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ storageKey: key, jobId: "newjob1" })],
      })
    );
  });

  it("still refuses a key signed for a different project even under the placeholder", async () => {
    const foreignKey = buildObjectKey({
      projectId: "p2",
      resource: "Job",
      resourceId: "new",
      filename: "photo.jpg",
    });

    const err = await createJobRequest(
      formData(
        {
          title: "Renew anodes",
          description: "Renew all sacrificial anodes on the rudder stocks.",
          designatedAuthoriserId: "authoriser1",
        },
        [{ key: foreignKey, filename: "photo.jpg", contentType: "image/jpeg", size: 100 }]
      )
    ).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(attachmentCreateMany).not.toHaveBeenCalled();
  });
});
