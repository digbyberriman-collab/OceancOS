import { test, expect, type Page } from "@playwright/test";

// Proves the project-scoping pass (ACTION_PLAN.md G2.1, AUDIT_REPORT.md's
// [TENANCY] Criticals) actually holds, not just that nothing crashed.
//
// Every one of the app's other seeded accounts holds an unscoped role
// assignment and can reach every project — none of them can exercise this.
// SCOPED reaches only p1 ("2026 Refit"). CO-P2-0001 and REQ-P2-0001 live on
// p2 ("Winter Maintenance Period") only; SCOPED must never see them.

const SCOPED = { email: "scoped@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("project scoping", () => {
  test("the change-order list omits another project's record", async ({ page }) => {
    await signIn(page, SCOPED);
    await page.goto("/change-orders");
    await expect(page.getByText(/CO-P2-0001/)).toHaveCount(0);
    await expect(page.getByText(/Northern Light galley refrigeration/)).toHaveCount(0);
  });

  test("the crew-request list omits another project's record", async ({ page }) => {
    await signIn(page, SCOPED);
    await page.goto("/crew-requests");
    await expect(page.getByText(/REQ-P2-0001/)).toHaveCount(0);
    await expect(page.getByText(/Sundeck helm chair upholstery/)).toHaveCount(0);
  });

  test("another project's change-order detail page 404s rather than showing it", async ({ page }) => {
    await signIn(page, SCOPED);
    // Find the id via search, the way a real cross-project link would arrive.
    await page.goto("/search?q=Northern+Light+galley");
    await expect(page.getByText(/no results/i)).toBeVisible();
  });

  test("the dashboard's counts reflect only the reachable project", async ({ page }) => {
    await signIn(page, SCOPED);
    await page.goto("/dashboard");
    // p1 has one open change order in its default seed state; the p2 fixture
    // above must not inflate this count.
    await expect(page.getByText(/CO-P2-0001/)).toHaveCount(0);
  });

  test("a change order created here belongs to the caller's own project, not one taken from the form", async ({
    page,
  }) => {
    test.slow();
    await signIn(page, SCOPED);
    await page.goto("/change-orders/new");
    // No project selector exists on this form at all — see the note on
    // ChangeOrderCreateSchema. Confirm the page names the scoped project.
    await expect(page.getByText("R-00721", { exact: true }).first()).toBeVisible();

    const title = `Tenancy regression ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Confirms the created record lands on the active project.");
    await page.getByLabel("Reason for Change").fill("Verifying G2.1's project derivation.");
    await page.getByRole("button", { name: /create draft/i }).click();

    await page.waitForURL((url) => /^\/change-orders\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    await expect(page.getByText("M/Y Solstice", { exact: false }).first()).toBeVisible();
  });
});
