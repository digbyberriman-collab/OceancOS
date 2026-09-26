import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { storageDriverName } from "@/lib/storage";

// C14: an unset STORAGE_DRIVER used to resolve to "local" silently — inferred
// from whether S3_BUCKET happened to be set — so a deployment that copied
// .env.example and never touched this line got a running app that wrote
// every upload to container-local disk, losing them on the next restart or
// redeploy with no error anywhere. G2.6 removes the inference entirely.

const original = { STORAGE_DRIVER: process.env.STORAGE_DRIVER, S3_BUCKET: process.env.S3_BUCKET };

function setEnv(storageDriver: string | undefined, s3Bucket: string | undefined) {
  if (storageDriver === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = storageDriver;
  if (s3Bucket === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = s3Bucket;
}

beforeEach(() => {
  setEnv(undefined, undefined);
});

afterAll(() => {
  setEnv(original.STORAGE_DRIVER, original.S3_BUCKET);
});

describe("storageDriverName", () => {
  it("returns the explicit value when set to local", () => {
    setEnv("local", undefined);
    expect(storageDriverName()).toBe("local");
  });

  it("returns the explicit value when set to s3", () => {
    setEnv("s3", undefined);
    expect(storageDriverName()).toBe("s3");
  });

  it("throws when unset, even with no S3_BUCKET configured", () => {
    setEnv(undefined, undefined);
    expect(() => storageDriverName()).toThrow(/STORAGE_DRIVER is not set/);
  });

  it("throws when unset, even though S3_BUCKET IS configured — nothing is inferred any more", () => {
    setEnv(undefined, "my-bucket");
    expect(() => storageDriverName()).toThrow(/STORAGE_DRIVER is not set/);
  });

  it("throws on an unrecognised value rather than silently falling back", () => {
    setEnv("dropbox", undefined);
    expect(() => storageDriverName()).toThrow(/STORAGE_DRIVER is not set/);
  });
});
