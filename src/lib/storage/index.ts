// File storage.
//
// Two drivers behind one interface:
//
//   s3    — any S3-compatible service. Cloudflare R2 is the chosen provider
//           (BRIDGE_ALIGNMENT_PLAN.md §7 decision 4); AWS S3 and MinIO work
//           with the same code and different env values.
//   local — writes under ./uploads for development and CI, so the app runs
//           with no cloud credentials.
//
// Uploads go straight from the browser to storage using a presigned PUT, so
// large drawings never pass through the Next.js server.

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isSafeObjectKey } from "./keys";

export * from "./keys";

export type SignedUpload = {
  key: string;
  /** Where the browser sends the file. */
  url: string;
  method: "PUT";
  /** Headers the browser must send with the PUT. */
  headers: Record<string, string>;
  expiresInSeconds: number;
};

export type StorageDriverName = "s3" | "local";

/**
 * Which storage driver is active.
 *
 * Required in production, with no inferred fallback: AUDIT_REPORT.md's
 * Critical C15/C14 (.env.example presented local-disk as the silent
 * production default). Inferring from S3_BUCKET meant a deployment that
 * simply forgot to configure a bucket ran on local disk with no error and
 * no warning — and most deployment platforms treat local disk as
 * ephemeral, so every upload would be lost on the next restart or
 * redeploy, discovered only when someone goes looking for a file that is
 * no longer there.
 *
 * Development, test and CI keep the inference: it is what lets the app run
 * with no cloud credentials, which is the whole point of the local driver
 * existing.
 */
export function storageDriverName(): StorageDriverName {
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "s3" || explicit === "local") return explicit;
  if (explicit) {
    throw new Error(`STORAGE_DRIVER must be "s3" or "local" — got "${explicit}".`);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STORAGE_DRIVER must be set in production (\"s3\" or \"local\"). Refusing to infer it " +
        "from whether S3_BUCKET happens to be set, which would silently run on local disk — " +
        "ephemeral on most deployment platforms — if the bucket were ever left unconfigured."
    );
  }
  // Outside production: infer, for a smooth local/dev/CI experience.
  return process.env.S3_BUCKET ? "s3" : "local";
}

const UPLOAD_URL_TTL = 15 * 60; // seconds
const DOWNLOAD_URL_TTL = 10 * 60;

// ---------------------------------------------------------------- S3 driver

type S3Config = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
};

function s3Config(): S3Config {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Storage misconfigured: set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, " +
        "or set STORAGE_DRIVER=local for development."
    );
  }

  return {
    bucket,
    // R2 ignores region but the SDK requires one.
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || undefined,
  };
}

async function s3Client() {
  const cfg = s3Config();
  const { S3Client } = await import("@aws-sdk/client-s3");
  return {
    cfg,
    client: new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      // R2 and MinIO need path-style addressing.
      forcePathStyle: Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    }),
  };
}

// -------------------------------------------------------------- Local driver

function localRoot(): string {
  return resolve(process.env.UPLOAD_DIR || "./uploads");
}

function localPath(key: string): string {
  if (!isSafeObjectKey(key)) throw new Error("Unsafe object key");
  const full = resolve(join(localRoot(), key));
  // Belt and braces: never write or read outside the upload root.
  if (full !== localRoot() && !full.startsWith(localRoot() + "/")) {
    throw new Error("Unsafe object key");
  }
  return full;
}

/**
 * Short-lived token proving the server authorised this local upload.
 * Only used by the local driver; the S3 driver relies on presigned URLs.
 */
export function localUploadToken(key: string, expiresAt: number): string {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  return createHash("sha256").update(`${key}:${expiresAt}:${secret}`).digest("hex").slice(0, 32);
}

export function verifyLocalUploadToken(key: string, expiresAt: number, token: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  const expected = localUploadToken(key, expiresAt);
  // Lengths are fixed, so a plain comparison is adequate here.
  return expected === token;
}

// ------------------------------------------------------------------- Public

/** Presign an upload. The caller has already authorised the user. */
export async function signUpload(opts: {
  key: string;
  contentType: string;
  contentLength?: number;
}): Promise<SignedUpload> {
  if (!isSafeObjectKey(opts.key)) throw new Error("Unsafe object key");

  if (storageDriverName() === "local") {
    const expiresAt = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL;
    const token = localUploadToken(opts.key, expiresAt);
    const params = new URLSearchParams({
      key: opts.key,
      expires: String(expiresAt),
      token,
    });
    return {
      key: opts.key,
      url: `/api/uploads/local?${params.toString()}`,
      method: "PUT",
      headers: { "Content-Type": opts.contentType },
      expiresInSeconds: UPLOAD_URL_TTL,
    };
  }

  const { cfg, client } = await s3Client();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: opts.key,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    }),
    { expiresIn: UPLOAD_URL_TTL }
  );

  return {
    key: opts.key,
    url,
    method: "PUT",
    headers: { "Content-Type": opts.contentType },
    expiresInSeconds: UPLOAD_URL_TTL,
  };
}

/**
 * A URL the browser can use to fetch the object.
 *
 * With a public base URL configured (an R2 custom domain, say) that is returned
 * directly; otherwise a short-lived signed GET. The local driver serves through
 * the app, which checks the session.
 */
export async function downloadUrl(key: string): Promise<string> {
  if (!isSafeObjectKey(key)) throw new Error("Unsafe object key");

  if (storageDriverName() === "local") {
    return `/api/uploads/local?key=${encodeURIComponent(key)}`;
  }

  const cfg = s3Config();
  if (cfg.publicBaseUrl) {
    return `${cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  const { client } = await s3Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
    expiresIn: DOWNLOAD_URL_TTL,
  });
}

/** Store bytes directly from the server. Used by the local upload route and by exports. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!isSafeObjectKey(key)) throw new Error("Unsafe object key");

  if (storageDriverName() === "local") {
    const path = localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return;
  }

  const { cfg, client } = await s3Client();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(
    new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType })
  );
}

/** Read an object back. Returns null when it is not there. */
export async function getObject(key: string): Promise<Buffer | null> {
  if (!isSafeObjectKey(key)) throw new Error("Unsafe object key");

  if (storageDriverName() === "local") {
    const path = localPath(key);
    try {
      await stat(path);
    } catch {
      return null;
    }
    return readFile(path);
  }

  const { cfg, client } = await s3Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!isSafeObjectKey(key)) throw new Error("Unsafe object key");

  if (storageDriverName() === "local") {
    try {
      await unlink(localPath(key));
    } catch {
      // Already gone — deleting is idempotent.
    }
    return;
  }

  const { cfg, client } = await s3Client();
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}
