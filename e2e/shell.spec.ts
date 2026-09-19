import { test, expect, type Page } from "@playwright/test";

// Credentials come from prisma/seed.ts.
const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("authentication", () => {
  test("redirects an anonymous visitor to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects a wrong password without signing in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(PM.email);
    await page.getByLabel(/password/i).fill("not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/err=/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs a project manager in and back out", async ({ page }) => {
    await signIn(page, PM);
    await expect(page.getByRole("heading", { name: /project dashboard/i })).toBeVisible();
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/login");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("project switcher", () => {
  test("lists the seeded projects and remembers the choice", async ({ page }) => {
    await signIn(page, PM);

    const switcher = page.getByLabel("Active project");
    await expect(switcher).toBeVisible();

    const options = await switcher.locator("option").allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.join(" ")).toContain("R-00721");
    expect(options.join(" ")).toContain("R-00806");

    // Switch to the second project.
    const second = (await switcher.locator("option").nth(1).getAttribute("value"))!;
    await switcher.selectOption(second);
    await expect(switcher).toHaveValue(second);

    // The choice survives a full page load, because it lives on the session.
    await page.goto("/change-orders");
    await expect(page.getByLabel("Active project")).toHaveValue(second);
  });
});

test.describe("permissions", () => {
  test("hides financial data from crew", async ({ page }) => {
    await signIn(page, CREW);
    await expect(page.getByText(/don.t have access to financial data/i)).toBeVisible();

    await page.goto("/financials");
    await expect(page.getByText(/forbidden/i)).toBeVisible();
  });

  test("shows financial data to a project manager", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/financials");
    await expect(page.getByRole("heading", { name: /financials/i })).toBeVisible();
    await expect(page.getByText(/forbidden/i)).toHaveCount(0);
  });
});
