import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS, type PermissionKey } from "@/lib/rbac";
import { listProjectsForUser } from "@/lib/project";
import {
  getObject,
  isSafeObjectKey,
  maxUploadBytes,
  putObject,
  storageDriverName,
  verifyLocalUploadToken,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Resolve a storage key to the record it belongs to and the permission
 * viewing it requires — the check the GET handler used to skip entirely
 * (auth-security [UPLOADS]: "checks only that a session exists and that the
 * key is syntactically safe... never looks up the owning Attachment or
 * Document, never checks project access, never checks a permission"). Keys
 * are structured and largely guessable (`projects/<projectId>/<resource>/
 * <resourceId>/...`), so syntactic safety alone let any signed-in user read
 * any project's files.
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
    const job = await prisma.job.findUnique({
      where: { id: attachment.jobId },
      select: { projectId: true },
    });
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
 * Local-disk storage endpoint, active only when STORAGE_DRIVER=local — a
 * choice for development and CI, where files do not need to survive a
 * restart or a redeploy. Everything else sets STORAGE_DRIVER=s3, where the
 * browser talks to the S3-compatible bucket directly and this route stays
 * dark (`localOnly()` below actually enforces that; docs [ENV] flagged the
 * previous comment here as describing a wish rather than a check — this
 * route did handle bytes if a deployment ever set no driver at all, since
 * `storageDriverName()` used to infer "local" silently. See
 * `storageDriverName()`'s own comment and G2.6 in ACTION_PLAN.md).
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

  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength > maxUploadBytes()) {
    return NextResponse.json({ error: "File is too large" }, { status: 413 });
  }

  await putObject(key, body, request.headers.get("content-type") ?? "application/octet-stream");
  return NextResponse.json({ key, size: body.byteLength });
}

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
    // 404, not 403: a key that resolves to a real file in a project this
    // user cannot reach should read exactly like one that does not exist.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await getObject(key);
  if (!body) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      // The key carries no type information, so let the browser sniff safely.
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `inline; filename="${key.split("/").pop()}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
