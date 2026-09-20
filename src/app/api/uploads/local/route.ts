import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
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

export async function GET(request: Request) {
  const guard = localOnly();
  if (guard) return guard;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isSafeObjectKey(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
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
