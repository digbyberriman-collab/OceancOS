import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/lib/rbac";

// The GET handler on /api/uploads/local used to check only that a session
// existed and that the key was syntactically safe — never who the file
// belongs to. Keys are structured and largely guessable
// (projects/<projectId>/<resource>/<resourceId>/...), so that let any
// signed-in user download any project's attachments (auth-security
// [UPLOADS], G2.5). These tests call the real exported GET handler with
// everything it touches mocked, to prove it now requires both the view
// permission the key's resource type needs and access to the key's project
// before ever reading bytes — resolving both straight from the key itself
// (parseObjectKey), never a database round trip, per storageKeys.test.ts.

const { getCurrentUser, accessibleProjectIds, getObjectStream } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  accessibleProjectIds: vi.fn(),
  getObjectStream: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/project", () => ({ accessibleProjectIds }));
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return {
    ...actual,
    storageDriverName: () => "local",
    getObjectStream,
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
  accessibleProjectIds.mockReset().mockResolvedValue(["p1"]);
  getObjectStream.mockReset().mockResolvedValue({ stream: new ReadableStream(), size: 5 });
});

describe("GET /api/uploads/local", () => {
  it("403s a caller who lacks the resource's view permission, before touching the project or the disk", async () => {
    getCurrentUser.mockResolvedValue(fakeUser([])); // no JOB_VIEW at all

    const res = await GET(req(KEY));

    expect(res.status).toBe(403);
    expect(accessibleProjectIds).not.toHaveBeenCalled();
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it("403s a caller who holds the permission but cannot reach the key's project", async () => {
    getCurrentUser.mockResolvedValue(fakeUser([PERMISSIONS.JOB_VIEW]));
    accessibleProjectIds.mockResolvedValue(["p-other"]); // not p1

    const res = await GET(req(KEY));

    expect(res.status).toBe(403);
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it("404s when nothing is on disk for an otherwise-authorised key", async () => {
    getCurrentUser.mockResolvedValue(fakeUser([PERMISSIONS.JOB_VIEW]));
    getObjectStream.mockResolvedValue(null);

    const res = await GET(req(KEY));

    expect(res.status).toBe(404);
  });

  it("serves the bytes once the key's resource permission and project access both check out", async () => {
    getCurrentUser.mockResolvedValue(fakeUser([PERMISSIONS.JOB_VIEW]));

    const res = await GET(req(KEY));

    expect(res.status).toBe(200);
    expect(getObjectStream).toHaveBeenCalledWith(KEY);
  });

  it("refuses an anonymous request before ever checking permission or project access", async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await GET(req(KEY));

    expect(res.status).toBe(401);
    expect(accessibleProjectIds).not.toHaveBeenCalled();
  });

  it("rejects an unrecognised resource type rather than defaulting to allowed", async () => {
    getCurrentUser.mockResolvedValue(fakeUser(Object.values(PERMISSIONS) as string[]));

    const res = await GET(req("projects/p1/Unknown/r1/abc123-file.pdf"));

    expect(res.status).toBe(403);
    expect(getObjectStream).not.toHaveBeenCalled();
  });
});
