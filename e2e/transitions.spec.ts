import { test, expect, type Page } from "@playwright/test";

// Both paths this file exercises had zero e2e coverage before G1.3 of
// ACTION_PLAN.md (see SITE_MAP.md's "untested" row for Approvals and Crew
// Requests). G1.3 rewired their status writes through applyTransition —
// this is the first end-to-end check that the change went in cleanly.

const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("**/login");
}

test.describe("change order transition", () => {
  test("submits a draft for review through applyTransition", async ({ page }) => {
    // Each spec file gets a cold dev-server compile of every route it's the
    // first to hit; /change-orders/[id] is untouched by any earlier spec.
    test.slow();

    await signIn(page, PM);
    await page.goto("/change-orders");
    // CO-0010, Fire damper servicing, seeded at DRAFT.
    await page.getByRole("link", { name: /Fire damper servicing/i }).click();
    await page.waitForURL(/\/change-orders\/[^/]+$/);

    await expect(page.getByText("DRAFT", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: /submit for review/i }).click();

    await expect(page.getByText("SUBMITTED", { exact: true }).first()).toBeVisible();
    // "DRAFT" legitimately survives in the history log's "DRAFT → SUBMITTED"
    // line — only the status badge's DRAFT needs to be gone, and its tone
    // (muted) distinguishes it from the history log's plain text.
    await expect(page.locator(".badge", { hasText: "DRAFT" })).toHaveCount(0);
  });
});

test.describe("crew request transition", () => {
  test("triages a new request through applyTransition", async ({ page }) => {
    test.slow(); // first hit of /crew-requests/new in this spec file

    const title = `Watertight door hinge seized ${Date.now()}`;

    // Crew holds crew_request.create but not crew_request.triage; PM is the
    // reverse. Two users, matching how e2e/jobs.spec.ts drives its loop.
    await signIn(page, CREW);
    await page.goto("/crew-requests/new");
    await page.getByLabel("Title").fill(title);
    await page
      .getByLabel("Description")
      .fill("Starboard watertight door hinge will not free off. Logged for engineering attention.");
    // Due Date is optional in the schema but z.coerce.date() rejects the ""
    // an untouched date input submits — AUDIT_REPORT.md's Critical C13,
    // fixed by G2.8, not yet landed. Fill it so this test exercises the
    // transition it's here for, not that bug.
    await page.getByLabel("Due Date").fill("2026-12-01");
    // Leaving "Linked Change Order" at its default "" throws a foreign-key
    // crash rather than a validation message — AUDIT_REPORT.md's Critical
    // C14, also fixed by G2.8. Select a real one so this test exercises the
    // transition it's here for, not that bug.
    await page.getByLabel("Linked Change Order").selectOption({ label: "CO-0001 — Replace owner's suite carpet" });
    // Leaving Assign To unset keeps the request at NEW rather than ASSIGNED.
    await page.getByRole("button", { name: /create|submit|save/i }).click();

    await page.waitForURL((url) => /^\/crew-requests\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    const crUrl = page.url();
    await expect(page.getByText("NEW", { exact: true }).first()).toBeVisible();

    await signOut(page);
    await signIn(page, PM);
    await page.goto(crUrl);

    await page.getByRole("button", { name: /^triage$/i }).click();

    await expect(page.getByText("TRIAGED", { exact: true }).first()).toBeVisible();
  });
});
