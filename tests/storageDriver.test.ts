import { describe, it, expect, afterEach, vi } from "vitest";
import { storageDriverName } from "@/lib/storage";

// vi.stubEnv, not direct assignment — @types/node (via Next's global.d.ts)
// declares NODE_ENV readonly, and vi.unstubAllEnvs() undoes every stub this
// file makes, whichever test made it.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storageDriverName", () => {
  it("honours an explicit value", () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    expect(storageDriverName()).toBe("s3");
    vi.stubEnv("STORAGE_DRIVER", "local");
    expect(storageDriverName()).toBe("local");
  });

  it("rejects a value that is neither s3 nor local", () => {
    vi.stubEnv("STORAGE_DRIVER", "azure");
    expect(() => storageDriverName()).toThrow(/must be "s3" or "local"/);
  });

  it("infers from S3_BUCKET outside production", () => {
    vi.stubEnv("STORAGE_DRIVER", undefined);
    vi.stubEnv("NODE_ENV", undefined);
    vi.stubEnv("S3_BUCKET", "refit-drawings");
    expect(storageDriverName()).toBe("s3");

    vi.stubEnv("S3_BUCKET", undefined);
    expect(storageDriverName()).toBe("local");
  });

  it("infers the same way in test and development", () => {
    vi.stubEnv("STORAGE_DRIVER", undefined);
    vi.stubEnv("S3_BUCKET", undefined);
    for (const env of ["test", "development", undefined]) {
      vi.stubEnv("NODE_ENV", env);
      expect(storageDriverName()).toBe("local");
    }
  });

  it("refuses to infer in production — the C15 fix", () => {
    // .env.example used to document local-disk as the silent production
    // default. A deployment that forgot to set S3_BUCKET would run on
    // local disk with no error — ephemeral on most platforms, so every
    // upload would be lost on the next restart with nothing to say why.
    vi.stubEnv("STORAGE_DRIVER", undefined);
    vi.stubEnv("S3_BUCKET", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => storageDriverName()).toThrow(/must be set in production/);
  });

  it("an explicit value in production is still honoured, not overridden", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_DRIVER", "s3");
    expect(storageDriverName()).toBe("s3");
  });
});
