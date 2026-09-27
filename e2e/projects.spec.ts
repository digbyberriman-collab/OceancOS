import { test, expect, type Page } from "@playwright/test";

// The fleet-wide projects register: every real vessel's yard periods and
// live projects, filterable, never the demo workspace.

const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("projects register", () => {
  test("lists the fleet's yard periods, and not the demo workspace", async ({ page }) => {
    await signIn(page, PM);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Projects", exact: true })
      .first()
      .click();
    await page.waitForURL("**/projects");
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Comprehensive rebuild / role conversion" }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByText("DEMO-01")).toHaveCount(0);
  });

  test("filters by yard and by a year a period touches", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/projects?yard=Navantia&year=2021");
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Vibrant Curiosity" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Sunrays" })).toHaveCount(1);

    // KAOS's refit ran March 2019 to November 2020, so it touches 2020.
    await page.goto("/projects?vessel=Y714&year=2020");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("2019-03 – 2020-11");
  });

  test("shows planning bands only to roles with financial access", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/projects?vessel=Y709");
    await expect(page.getByRole("columnheader", { name: "Planning band" })).toBeVisible();
    await expect(page.getByText("€30m–€70m+")).toBeVisible();

    // A fresh session as crew, rather than racing the sign-out's redirect.
    await page.context().clearCookies();
    await signIn(page, CREW);
    await page.goto("/projects?vessel=Y709");
    await expect(
      page.getByRole("link", { name: "Comprehensive rebuild / role conversion" }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Planning band" })).toHaveCount(0);
    await expect(page.getByText("€30m–€70m+")).toHaveCount(0);
  });
});
