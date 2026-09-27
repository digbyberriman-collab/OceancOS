import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listProjectsForUser } from "@/lib/project";
import { hasPermission, PERMISSIONS, type PermissionKey } from "@/lib/rbac";
import {
  getObjectStream,
  isSafeObjectKey,
  maxUploadBytes,
  putObjectStream,
  storageDriverName,
  UploadTooLargeError,
  verifyLocalUploadToken,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Resolve a storage key to the project it belongs to and the permission
 * viewing it requires, via the Attachment row that actually references it —
 * not the key's own `projects/<projectId>/<resource>/<resourceId>/...`
 * segments. Trusting those segments alone would mean any key that merely
 * *looks* well-formed for a project this caller can reach — including one
 * signed and stored but never attached to anything, or one guessed against
 * another user's record in a shared project — reads back successfully.
 * ACTION_PLAN.md G2.5 / AUDIT_REPORT.md C3 is specifically that signing and
 * storing a file must not by itself entitle anyone to read it back; only a
 * real Attachment row pointing at the key does.
 */
async function resolveAttachmentAccess(
  key: string
): Promise<{ projectId: string; permission: PermissionKey } | null> {
  const attachment = await prisma.attachment.findFirst({
    where: { storageKey: key },
    select: { jobId: true, changeOrderId: true, crewRequestId: true },
  });
  if (!attachment) return null;

  if (attachment.jobId) {
    const job = await prisma.job.findUnique({ where: { id: attachment.jobId }, select: { projectId: true } });
    return job ? { projectId: job.projectId, permission: PERMISSIONS.JOB_VIEW } : null;
  }
  if (attachment.changeOrderId) {
    const co = await prisma.changeOrder.findUnique({
      where: { id: attachment.changeOrderId },
      select: { projectId: true },
    });
    return co ? { projectId: co.projectId, permission: PERMISSIONS.CO_VIEW } : null;
  }
  if (attachment.crewRequestId) {
    const cr = await prisma.crewRequest.findUnique({
      where: { id: attachment.crewRequestId },
      select: { projectId: true },
    });
    return cr ? { projectId: cr.projectId, permission: PERMISSIONS.CR_VIEW } : null;
  }
  return null;
}

/**
 * Local-disk storage endpoint, used when STORAGE_DRIVER is "local".
 *
 * In production the s3 driver is used instead and the browser talks to
 * Cloudflare R2 directly, so this route never handles the bytes.
 */

function localOnly() {
  if (storageDriverName() !== "local") {
    return NextResponse.json({ error: "Not available with cloud storage" }, { status: 404 });
  }
  return null;
}

export async function PUT(request: Request) {
  const guard = localOnly();
  if (guard) return guard;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const expires = Number(url.searchParams.get("expires"));
  const token = url.searchParams.get("token") ?? "";

  if (!isSafeObjectKey(key) || !verifyLocalUploadToken(key, expires, token)) {
    return NextResponse.json({ error: "Upload not authorised" }, { status: 403 });
  }

  // Reject on the declared size before touching the body at all — no point
  // streaming megabytes to disk only to discover it's over the limit at the
  // end (ACTION_PLAN.md G4.8). A caller that lies about Content-Length is
  // still caught mid-stream by putObjectStream's own running count.
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxUploadBytes()) {
    return NextResponse.json({ error: "File is too large" }, { status: 413 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "No file data" }, { status: 400 });
  }

  try {
    const size = await putObjectStream(key, request.body, maxUploadBytes());
    return NextResponse.json({ key, size });
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return NextResponse.json({ error: "File is too large" }, { status: 413 });
    }
    throw err;
  }
}

/**
 * Serve an uploaded file back.
 *
 * Before this checked only that a session existed — AUDIT_REPORT.md's
 * Critical C3: any signed-in user, CONTRACTOR, SUPPLIER and GUEST
 * included, could download any stored file by object key, since keys are
 * structured and `projectId`/`resourceId` appear in ordinary URLs. Now
 * resolves the key back to the record that actually references it
 * (resolveAttachmentAccess) and requires both: the caller must be able to
 * reach that record's project, and must hold the view permission the
 * resource type requires. A key with no matching Attachment, or one whose
 * project or permission the caller doesn't hold, 404s rather than 403s — it
 * should read exactly like a key that was never issued at all, not confirm
 * that *something* exists there.
 */
export async function GET(request: Request) {
  const guard = localOnly();
  if (guard) return guard;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isSafeObjectKey(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const access = await resolveAttachmentAccess(key);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const projects = await listProjectsForUser(user.id);
  if (!projects.some((p) => p.id === access.projectId) || !hasPermission(user, access.permission)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const object = await getObjectStream(key);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(object.stream, {
    headers: {
      // The key carries no type information, so let the browser sniff safely.
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `inline; filename="${key.split("/").pop()}"`,
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(object.size),
    },
  });
}
