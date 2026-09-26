import { test, expect, type Page } from "@playwright/test";

// AUDIT_REPORT.md's Critical C3 — the download route checked only that a
// session existed, so any signed-in user could fetch any stored file by
// object key. Fixed by G2.5: the key is resolved back to the project and
// resource it was minted for, and both project access and the resource's
// view permission are required.

const PM = { email: "pm@oceancos.dev", password: "password" };
// Scoped to p1 only — see e2e/tenancy.spec.ts's fixture note.
const SCOPED = { email: "scoped@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("upload download authorization", () => {
  test("refuses a key for a project the caller cannot reach", async ({ page }) => {
    await signIn(page, SCOPED);
    const status = await page.evaluate(async () => {
      const res = await fetch(
        "/api/uploads/local?key=" + encodeURIComponent("projects/p2/Job/j1/aaaaaaaaaaaaaaaa-x.pdf")
      );
      return res.status;
    });
    expect(status).toBe(403);
  });

  test("serves a key for a project the caller can reach", async ({ page }) => {
    await signIn(page, SCOPED);
    const result = await page.evaluate(async () => {
      const body = "in-scope upload";
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "p1",
          resource: "Job",
          resourceId: "j1",
          filename: "in-scope.pdf",
          contentType: "application/pdf",
          size: body.length,
        }),
      });
      if (!signRes.ok) return { step: "sign", status: signRes.status };
      const signed = await signRes.json();
      const putRes = await fetch(signed.url, { method: "PUT", headers: signed.headers, body });
      if (!putRes.ok) return { step: "put", status: putRes.status };
      const getRes = await fetch(`/api/uploads/local?key=${encodeURIComponent(signed.key)}`);
      return { step: "done", status: getRes.status, text: await getRes.text() };
    });
    expect(result.step).toBe("done");
    expect(result.status).toBe(200);
    expect(result.text).toBe("in-scope upload");
  });

  test("refuses a key for a resource type with no view-permission mapping", async ({ page }) => {
    // Nothing maps to an unrecognised resource segment, which is refused
    // rather than allowed by default — a future upload path is secure until
    // someone adds it to RESOURCE_VIEW_PERMISSION deliberately.
    await signIn(page, PM);
    const status = await page.evaluate(async () => {
      const res = await fetch(
        "/api/uploads/local?key=" + encodeURIComponent("projects/p1/SomeNewThing/x1/aaaaaaaaaaaaaaaa-x.pdf")
      );
      return res.status;
    });
    expect(status).toBe(403);
  });
});
