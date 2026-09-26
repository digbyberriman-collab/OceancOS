import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/lib/rbac";

// The GET handler on /api/uploads/local used to check only that a session
// existed and that the key was syntactically safe — never who the file
// belongs to. Keys are structured and largely guessable
// (projects/<projectId>/<resource>/<resourceId>/...), so that let any
// signed-in user download any project's attachments (auth-security
// [UPLOADS], G2.5). These tests call the real exported GET handler with
// everything it touches mocked, to prove it now resolves the key to its
// owning record and checks both project access and the relevant view
// permission before ever reading bytes.

const { getCurrentUser, attachmentFindFirst, jobFindUnique, listProjectsForUser, getObject } =
  vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    attachmentFindFirst: vi.fn(),
    jobFindUnique: vi.fn(),
    listProjectsForUser: vi.fn(),
    getObject: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    attachment: { findFirst: attachmentFindFirst },
    job: { findUnique: jobFindUnique },
    changeOrder: { findUnique: vi.fn() },
    crewRequest: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/project", () => ({ listProjectsForUser }));
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return {
    ...actual,
    storageDriverName: () => "local",
    getObject,
  };
});

import { GET } from "@/app/api/uploads/local/route";

function fakeUser(perms: string[]) {
  return { id: "u1", email: "u@example.com", name: "Test User", roles: [], roleKeys: [], permissions: new Set(perms) } as any;
}

function req(key: string) {
  return new Request(`http://localhost/api/uploads/local?key=${encodeURIComponent(key)}`);
}

const KEY = "projects/p1/Job/job1/abc123-photo.jpg";

beforeEach(() => {
  attachmentFindFirst.mockReset();
  jobFindUnique.mockReset();
  listProjectsForUser.mockReset().mockResolvedValue([{ id: "p1" }]);
  getObject.mockReset().mockResolvedValue(Buffer.from("bytes"));
});

describe("GET /api/uploads/local", () => {
  it("404s a key with no matching Attachment row, rather than serving whatever is on disk", async () => {
    getCurrentUser.mockResolvedValue(fakeUser([PERMISSIONS.JOB_VIEW]));
    attachmentFindFirst.mockResolvedValue(null);

    const res = await GET(req(KEY));

    expect(res.status).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });

  it("404s (not 403) when the caller cannot reach the attachment's project", async () => {
    getCurrentUser.mockResolvedValue(fakeUser([PERMISSIONS.JOB_VIEW]));
    attachmentFindFirst.mockResolvedValue({ jobId: "job1", changeOrderId: null, crewRequestId: null });
    jobFindUnique.mockResolvedValue({ projectId: "p-other" });
    listProjectsForUser.mockResolvedValue([{ id: "p1" }]); // p1, not p-other

    const res = await GET(req(KEY));

    expect(res.status).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });

  it("404s a caller who can reach the project but lacks the resource's view permission", async () => {
    getCurrentUser.mockResolvedValue(fakeUser([])); // no JOB_VIEW at all
    attachmentFindFirst.mockResolvedValue({ jobId: "job1", changeOrderId: null, crewRequestId: null });
    jobFindUnique.mockResolvedValue({ projectId: "p1" });

    const res = await GET(req(KEY));

    expect(res.status).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });

  it("serves the bytes once the attachment resolves to a project the caller can reach with the right permission", async () => {
    getCurrentUser.mockResolvedValue(fakeUser([PERMISSIONS.JOB_VIEW]));
    attachmentFindFirst.mockResolvedValue({ jobId: "job1", changeOrderId: null, crewRequestId: null });
    jobFindUnique.mockResolvedValue({ projectId: "p1" });

    const res = await GET(req(KEY));

    expect(res.status).toBe(200);
    expect(getObject).toHaveBeenCalledWith(KEY);
  });

  it("refuses an anonymous request before ever looking up the attachment", async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await GET(req(KEY));

    expect(res.status).toBe(401);
    expect(attachmentFindFirst).not.toHaveBeenCalled();
  });
});
