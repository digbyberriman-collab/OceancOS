import { test, expect, type Page } from "@playwright/test";

// AUDIT_REPORT.md's Critical C6 (four of nine transitions had no permission
// check at all) and its neighbouring High (assignCrewRequest bypassed the
// transition map and could reopen a closed request) — both fixed by
// ACTION_PLAN.md's G2.4. Neither had any e2e coverage before this.

const PM = { email: "pm@oceancos.dev", password: "password" }; // holds CR_TRIAGE, CR_ASSIGN, CR_COMPLETE
const CREW = { email: "crew@oceancos.dev", password: "password" }; // holds neither

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("crew request permission coverage", () => {
  test("a user with no crew-request permission sees no workflow buttons at all", async ({ page }) => {
    // REQ-0001, seeded ASSIGNED. Before G2.4, IN_PROGRESS/BLOCKED/
    // AWAITING_APPROVAL/REJECTED had no permission check whatsoever — CREW,
    // who holds none of CR_TRIAGE/CR_ASSIGN/CR_COMPLETE, could still move it.
    await signIn(page, CREW);
    await page.goto("/crew-requests");
    await page.getByRole("link", { name: /Generator 2 oil leak/i }).click();
    await page.waitForURL(/\/crew-requests\/[^/]+$/);

    await expect(page.getByRole("heading", { name: "Workflow Actions" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /start work|mark blocked|reject/i })).toHaveCount(0);
  });

  test("a triage-holding user can walk the previously-unchecked statuses", async ({ page }) => {
    test.slow();
    await signIn(page, PM);
    await page.goto("/crew-requests");
    await page.getByRole("link", { name: /Generator 2 oil leak/i }).click();
    await page.waitForURL(/\/crew-requests\/[^/]+$/);

    await page.getByRole("button", { name: "Start Work", exact: true }).click();
    await expect(page.getByText("IN PROGRESS", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Mark Blocked", exact: true }).click();
    await expect(page.getByText("BLOCKED", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Resume Work", exact: true }).click();
    await expect(page.getByText("IN PROGRESS", { exact: true }).first()).toBeVisible();
  });
});

async function signOut(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("**/login");
}

test.describe("assignment no longer bypasses the transition map", () => {
  test("assigning a closed request changes only the owner, not the status", async ({ page }) => {
    test.slow();

    // CREW holds CR_CREATE but neither CR_TRIAGE, CR_ASSIGN nor CR_COMPLETE;
    // PM is the reverse — same split as the create/triage pair in
    // e2e/transitions.spec.ts. Build the fixture as CREW, then drive and
    // close it as PM.
    await signIn(page, CREW);
    await page.goto("/crew-requests/new");
    const title = `Assignment regression ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Confirms assignment cannot reopen a closed request.");
    await page.getByLabel("Due Date").fill("2026-12-01");
    await page.getByLabel("Linked Change Order").selectOption({ label: "CO-0001 — Replace owner's suite carpet" });
    await page.getByRole("button", { name: /create request/i }).click();
    await page.waitForURL((url) => /^\/crew-requests\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    const crUrl = page.url();

    await signOut(page);
    await signIn(page, PM);
    await page.goto(crUrl);

    for (const label of ["Triage", "Mark Assigned", "Start Work", "Complete", "Close"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
    }
    // "Closed" (title case) — CrewRequest's CLOSED status collides with
    // Job's own CLOSED entry in the shared STATUS_LABELS map, which is a
    // pre-existing cosmetic quirk, not something G2.4 touches.
    await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Workflow Actions" })).toHaveCount(0);

    // Reassigning must not resurrect it.
    await page.getByLabel("Assign To").selectOption({ label: "Ed Engineer" });
    await page.getByRole("button", { name: /save assignment/i }).click();

    await expect(page.locator("dl").getByText("Ed Engineer")).toBeVisible();
    await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Workflow Actions" })).toHaveCount(0);
  });
});
