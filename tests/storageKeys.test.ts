import { describe, it, expect } from "vitest";
import {
  ALLOWED_UPLOAD_TYPES,
  buildObjectKey,
  isAllowedUploadType,
  isSafeObjectKey,
  safeFilename,
} from "@/lib/storage/keys";

describe("safeFilename", () => {
  it("keeps an ordinary name, lowercased", () => {
    expect(safeFilename("Engine Room GA.pdf")).toBe("engine-room-ga.pdf");
  });

  it("strips directory components", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\me\\drawing.dwg")).toBe("drawing.dwg");
  });

  it("removes characters that do not belong in a key", () => {
    expect(safeFilename("quote #12 (rev 2)&final.pdf")).toBe("quote-12-rev-2-final.pdf");
  });

  it("never returns an empty string", () => {
    expect(safeFilename("")).toBe("file");
    expect(safeFilename("???")).toBe("file");
    expect(safeFilename("...")).toBe("file");
  });

  it("truncates a very long name but keeps the extension", () => {
    const name = "a".repeat(300) + ".pdf";
    const out = safeFilename(name);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("produces a key-safe result for any input", () => {
    for (const name of ["../x", "a b c.png", "@@@.jpg", "тест.pdf", "x".repeat(400)]) {
      expect(isSafeObjectKey(safeFilename(name)), `for ${name}`).toBe(true);
    }
  });
});

describe("buildObjectKey", () => {
  const target = {
    projectId: "p1",
    resource: "Job",
    resourceId: "job123",
    filename: "Hull survey.pdf",
  };

  it("groups by project then resource", () => {
    expect(buildObjectKey(target, "abc123")).toBe(
      "projects/p1/Job/job123/abc123-hull-survey.pdf"
    );
  });

  it("produces a safe key", () => {
    expect(isSafeObjectKey(buildObjectKey(target))).toBe(true);
  });

  it("cannot be escaped by a hostile filename", () => {
    const key = buildObjectKey({ ...target, filename: "../../../secrets.env" }, "r");
    expect(key).toBe("projects/p1/Job/job123/r-secrets.env");
    expect(isSafeObjectKey(key)).toBe(true);
  });

  it("cannot be escaped by hostile identifiers", () => {
    const key = buildObjectKey(
      { projectId: "../..", resource: "a/b", resourceId: "..", filename: "x.png" },
      "r"
    );
    expect(key.includes("..")).toBe(false);
    expect(isSafeObjectKey(key)).toBe(true);
  });

  it("gives two uploads of the same filename different keys", () => {
    expect(buildObjectKey(target)).not.toBe(buildObjectKey(target));
  });
});

describe("isSafeObjectKey", () => {
  it("accepts a normal key", () => {
    expect(isSafeObjectKey("projects/p1/Job/j1/abc-file.pdf")).toBe(true);
  });

  it("rejects traversal, absolute and empty keys", () => {
    expect(isSafeObjectKey("")).toBe(false);
    expect(isSafeObjectKey("/etc/passwd")).toBe(false);
    expect(isSafeObjectKey("a/../b")).toBe(false);
    expect(isSafeObjectKey("a/./b")).toBe(false);
    expect(isSafeObjectKey("a//b")).toBe(false);
  });

  it("rejects keys with spaces or shell characters", () => {
    expect(isSafeObjectKey("a/b c.png")).toBe(false);
    expect(isSafeObjectKey("a/$(whoami)")).toBe(false);
  });

  it("rejects an absurdly long key", () => {
    expect(isSafeObjectKey("a/".repeat(700))).toBe(false);
  });
});

describe("upload type allowlist", () => {
  it("accepts the formats crew actually attach", () => {
    for (const type of ["image/jpeg", "image/png", "application/pdf", "video/mp4"]) {
      expect(isAllowedUploadType(type), type).toBe(true);
    }
  });

  it("rejects executables and scripts", () => {
    for (const type of [
      "application/x-msdownload",
      "text/html",
      "application/javascript",
      "application/x-sh",
      "",
    ]) {
      expect(isAllowedUploadType(type), type).toBe(false);
    }
  });

  it("lists no duplicates", () => {
    expect(new Set(ALLOWED_UPLOAD_TYPES).size).toBe(ALLOWED_UPLOAD_TYPES.length);
  });
});
