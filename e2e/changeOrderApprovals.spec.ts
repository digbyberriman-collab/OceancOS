import { test, expect, type Page } from "@playwright/test";

// decideChangeOrderApproval had zero e2e coverage before G2.2 of
// ACTION_PLAN.md (SITE_MAP.md's "untested" row for Approvals) — and it's
// the function carrying five of the audit's Criticals (C5, C7, C8, C9,
// C10). This proves the rewrite end to end: the chain is sequential, a
// rejection is terminal rather than something the remaining stages can
// override, and a full approval sets approvedCost.

const PM = { email: "pm@oceancos.dev", password: "password" };
const CAPTAIN = { email: "captain@oceancos.dev", password: "password" };
const TECH = { email: "tech@oceancos.dev", password: "password" };
const YARD = { email: "yard@oceancos.dev", password: "password" };
const OWNERS_REP = { email: "rep@oceancos.dev", password: "password" };
const FINANCE = { email: "finance@oceancos.dev", password: "password" };

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

async function decide(page: Page, decision: "APPROVED" | "REJECTED" | "MORE_INFO") {
  const label = decision === "APPROVED" ? "Approve" : decision === "REJECTED" ? "Reject" : "Request Info";
  await page.getByRole("button", { name: label, exact: true }).click();
}

test.describe("change order approval chain", () => {
  test("is sequential, and a full chain sets the approved cost", async ({ page }) => {
    test.slow();

    // --- Build a fresh chain, fully under this test's control -----------
    await signIn(page, PM);
    await page.goto("/change-orders/new");
    const title = `Approval chain regression ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Confirms the order gate and a completed chain.");
    await page.getByLabel("Reason for Change").fill("Verifying G2.2's rewrite.");
    await page.getByLabel("Estimated Cost (EUR)").fill("12300");
    await page.getByRole("button", { name: /create draft/i }).click();
    await page.waitForURL((url) => /^\/change-orders\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    const coUrl = page.url();

    await page.getByRole("button", { name: /submit for review/i }).click();
    await expect(page.getByText("SUBMITTED", { exact: true }).first()).toBeVisible();

    // --- The order gate: TECH_MANAGER cannot go before CAPTAIN -----------
    await signOut(page);
    await signIn(page, TECH);
    await page.goto(coUrl);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await expect(page.getByText(/waiting on captain/i)).toBeVisible();

    // --- CAPTAIN decides first --------------------------------------------
    await signOut(page);
    await signIn(page, CAPTAIN);
    await page.goto(coUrl);
    await decide(page, "APPROVED");
    // A partial approval on a still-SUBMITTED chain moves it to UNDER_REVIEW.
    await expect(page.getByText("UNDER_REVIEW", { exact: true }).first()).toBeVisible();

    // --- Now TECH_MANAGER is unblocked ------------------------------------
    await signOut(page);
    await signIn(page, TECH);
    await page.goto(coUrl);
    await expect(page.getByText(/waiting on captain/i)).toHaveCount(0);
    await decide(page, "APPROVED");

    // --- YARD, OWNERS_REP, FINANCE complete the chain ---------------------
    for (const user of [YARD, OWNERS_REP, FINANCE]) {
      await signOut(page);
      await signIn(page, user);
      await page.goto(coUrl);
      await decide(page, "APPROVED");
    }

    // --- Fully approved, and the cost was actually written ----------------
    await expect(page.getByText("APPROVED", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("€12,300").first()).toBeVisible(); // Estimated Cost
    const approvedCostRow = page.locator("dt", { hasText: "Approved Cost" }).locator("..");
    await expect(approvedCostRow.getByText("€12,300")).toBeVisible();
  });

  test("a rejection is terminal — the remaining stages cannot still approve it through", async ({ page }) => {
    // CO-0009, seeded SUBMITTED with every stage PENDING.
    await signIn(page, CAPTAIN);
    await page.goto("/change-orders");
    await page.getByRole("link", { name: /Anchor chain re-galvanising/i }).click();
    await page.waitForURL(/\/change-orders\/[^/]+$/);
    const coUrl = page.url();

    await decide(page, "REJECTED");
    await expect(page.getByText("REJECTED", { exact: true }).first()).toBeVisible();

    // This is the C7 reproduction: before the fix, the four still-PENDING
    // stages approving would flip the change order to APPROVED regardless
    // of the captain's rejection. Now the decide form isn't even offered —
    // the change order has left the set of statuses a decision is valid in.
    await signOut(page);
    await signIn(page, TECH);
    await page.goto(coUrl);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await expect(page.getByText("REJECTED", { exact: true }).first()).toBeVisible();
  });

  test("a revised change order can actually be edited, and resubmitting restarts the chain (ACTION_PLAN.md G3.9)", async ({ page }) => {
    test.slow();

    // Build and reject a fresh chain, so this test doesn't disturb seeded data.
    await signIn(page, PM);
    await page.goto("/change-orders/new");
    const title = `Revise-and-edit regression ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Confirms Revise leads to an actual edit, not a dead end.");
    await page.getByLabel("Reason for Change").fill("Verifying G3.9's fix.");
    await page.getByLabel("Estimated Cost (EUR)").fill("5000");
    await page.getByRole("button", { name: /create draft/i }).click();
    await page.waitForURL((url) => /^\/change-orders\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    const coUrl = page.url();
    await page.getByRole("button", { name: /submit for review/i }).click();

    await signOut(page);
    await signIn(page, CAPTAIN);
    await page.goto(coUrl);
    await decide(page, "REJECTED");

    // "Revise" (REJECTED → DRAFT) used to be a dead end: every field was
    // frozen from creation, so there was nothing to actually revise.
    await signOut(page);
    await signIn(page, PM);
    await page.goto(coUrl);
    await page.getByRole("button", { name: "Revise", exact: true }).click();
    await expect(page.getByText("DRAFT", { exact: true }).first()).toBeVisible();

    await page.getByRole("link", { name: /edit details/i }).click();
    await page.waitForURL(/\/edit$/);
    await expect(page.getByLabel("Title")).toHaveValue(title);
    const revisedTitle = `${title} (revised)`;
    await page.getByLabel("Title").fill(revisedTitle);
    await page.getByLabel("Estimated Cost (EUR)").fill("7500");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForURL(coUrl);

    await expect(page.getByRole("heading", { name: revisedTitle })).toBeVisible();
    await expect(page.getByText("€7,500").first()).toBeVisible();

    // Resubmitting must genuinely restart the chain: the captain's earlier
    // rejection cannot still be sitting there blocking (or worse, silently
    // not blocking) the next review.
    await page.getByRole("button", { name: /submit for review/i }).click();
    await signOut(page);
    await signIn(page, TECH);
    await page.goto(coUrl);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await expect(page.getByText(/waiting on captain/i)).toBeVisible();
  });
});
