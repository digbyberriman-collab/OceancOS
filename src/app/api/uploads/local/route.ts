import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { accessibleProjectIds } from "@/lib/project";
import { hasPermission, PERMISSIONS, type PermissionKey } from "@/lib/rbac";
import {
  getObject,
  isSafeObjectKey,
  maxUploadBytes,
  parseObjectKey,
  putObject,
  storageDriverName,
  verifyLocalUploadToken,
} from "@/lib/storage";

/**
 * The view permission a key's `resource` segment requires to be read back.
 *
 * Only "Job" is ever actually minted today (the one live caller is
 * jobs/new/page.tsx's FileDrop) — everything else is a scaffold with no
 * upload path wired up yet. An unrecognised resource is refused rather than
 * allowed, so a future upload path is secure by default until someone adds
 * it here deliberately.
 */
const RESOURCE_VIEW_PERMISSION: Record<string, PermissionKey> = {
  Job: PERMISSIONS.JOB_VIEW,
  ChangeOrder: PERMISSIONS.CO_VIEW,
  CrewRequest: PERMISSIONS.CR_VIEW,
  Document: PERMISSIONS.DOC_VIEW,
  Drawing: PERMISSIONS.DRW_VIEW,
};

export const dynamic = "force-dynamic";

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

  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength > maxUploadBytes()) {
    return NextResponse.json({ error: "File is too large" }, { status: 413 });
  }

  await putObject(key, body, request.headers.get("content-type") ?? "application/octet-stream");
  return NextResponse.json({ key, size: body.byteLength });
}

/**
 * Serve an uploaded file back.
 *
 * Before this checked only that a session existed — AUDIT_REPORT.md's
 * Critical C3: any signed-in user, CONTRACTOR, SUPPLIER and GUEST
 * included, could download any stored file by object key, since keys are
 * structured and `projectId`/`resourceId` appear in ordinary URLs. Now
 * resolves the key back to the project and resource it was minted for
 * (parseObjectKey — sound to trust because buildObjectKey is only ever
 * called after /api/uploads/sign has already checked project access) and
 * requires both: the caller must be able to reach that project, and must
 * hold the view permission the resource type requires.
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

  const target = parseObjectKey(key);
  if (!target) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const permKey = RESOURCE_VIEW_PERMISSION[target.resource];
  if (!permKey || !hasPermission(user, permKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projectIds = await accessibleProjectIds(user.id);
  if (!projectIds.includes(target.projectId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
