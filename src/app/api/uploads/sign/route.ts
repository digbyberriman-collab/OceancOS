import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listProjectsForUser } from "@/lib/project";
import {
  buildObjectKey,
  isAllowedUploadType,
  maxUploadBytes,
  signUpload,
  ALLOWED_UPLOAD_TYPES,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

const Body = z.object({
  projectId: z.string().min(1),
  resource: z.string().min(1).max(40),
  resourceId: z.string().min(1).max(64),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

/**
 * Authorise an upload and hand back a presigned PUT.
 *
 * The browser then sends the file straight to storage, so large drawings never
 * pass through this server. Everything that decides whether an upload is
 * allowed is checked here: session, project access, type and size.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isAllowedUploadType(parsed.contentType)) {
    return NextResponse.json(
      { error: `File type not allowed`, allowed: ALLOWED_UPLOAD_TYPES },
      { status: 415 }
    );
  }

  const limit = maxUploadBytes();
  if (parsed.size > limit) {
    return NextResponse.json(
      { error: `File is too large`, maxBytes: limit },
      { status: 413 }
    );
  }

  // Never mint a key for a project the user cannot reach.
  const projects = await listProjectsForUser(user.id);
  if (!projects.some((p) => p.id === parsed.projectId)) {
    return NextResponse.json({ error: "No access to that project" }, { status: 403 });
  }

  const key = buildObjectKey({
    projectId: parsed.projectId,
    resource: parsed.resource,
    resourceId: parsed.resourceId,
    filename: parsed.filename,
  });

  try {
    const signed = await signUpload({
      key,
      contentType: parsed.contentType,
      contentLength: parsed.size,
    });
    return NextResponse.json(signed);
  } catch (err) {
    // A misconfigured bucket should read as a server problem, not a bad request.
    const message = err instanceof Error ? err.message : "Could not sign upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
