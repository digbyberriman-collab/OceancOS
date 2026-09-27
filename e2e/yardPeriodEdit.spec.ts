import { test, expect, type Page } from "@playwright/test";

// Correcting and filling in a historical yard period. Works on Wheels (Y703)
// and Alfa Nero (Y702) so it does not disturb the periods other specs read.

const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

async function openPeriod(page: Page, vessel: string, periodType: string) {
  await page.goto(`/projects?vessel=${vessel}`);
  await page.getByRole("link", { name: periodType, exact: true }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
}

test.describe("editing a yard period", () => {
  test("keeps dates at a precision a source could give", async ({ page }) => {
    await signIn(page, PM);
    await openPeriod(page, "Y703", "Major refit / emissions upgrade");
    await page.getByRole("link", { name: "Edit period" }).click();
    await page.waitForURL(/\/edit$/);

    await page.getByLabel("From").fill("late 2023");
    await page.getByRole("button", { name: "Save period" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("as the source gives it");
    await expect(page.getByLabel("From")).toHaveValue("late 2023");

    await page.getByLabel("From").fill("2023-10");
    await page.getByLabel("Precision").fill("Month to year");
    await page.getByRole("button", { name: "Save period" }).click();
    await page.waitForURL(/\/projects\/[^/]+\?saved=record$/);
    await expect(page.getByText("Yard period saved.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "2023-10 – 2024" })).toBeVisible();
  });

  test("adds, refiles and removes scope lines", async ({ page }) => {
    test.slow();
    await signIn(page, PM);
    await openPeriod(page, "Y703", "Major refit / emissions upgrade");
    await page.getByRole("link", { name: "Edit period" }).click();
    await page.waitForURL(/\/edit$/);
    const scope = page.locator("#scope");

    await scope
      .getByRole("combobox", { name: "Discipline", exact: true })
      .selectOption("SURVEY_CLASS_COMPLIANCE");
    await scope.getByLabel("Work done").fill("Class intermediate survey");
    await scope.getByRole("button", { name: "Add scope line" }).click();
    await expect(scope.getByText("Class intermediate survey", { exact: true })).toBeVisible();

    const sundeck = scope.locator("li").filter({ hasText: "New sundeck construction" });
    await sundeck.getByRole("combobox").selectOption("DECK_TENDER_MISSION");
    await sundeck.getByRole("button", { name: "Move", exact: true }).click();
    // The discipline's heading and its list share a parent.
    const deck = scope
      .getByRole("heading", { name: "Deck, tenders & mission equipment" })
      .locator("..");
    await expect(deck).toContainText("New sundeck construction");

    await scope
      .locator("li")
      .filter({ hasText: "Class intermediate survey" })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(scope.getByText("Class intermediate survey", { exact: true })).toHaveCount(0);
  });

  test("defers a historical period's dates to its record in project admin", async ({ page }) => {
    await signIn(page, PM);
    await openPeriod(page, "Y702", "Comprehensive mechanical & cosmetic refit");
    const id = page.url().split("/").pop();
    await page.goto(`/admin/projects?id=${id}`);
    await expect(page.getByLabel("Status")).toHaveValue("COMPLETED");
    await expect(page.getByText("keeps its dates as published")).toBeVisible();
    await expect(page.getByLabel("Arrival")).toHaveCount(0);
  });

  test("is closed to crew", async ({ page }) => {
    await signIn(page, CREW);
    await openPeriod(page, "Y702", "Comprehensive mechanical & cosmetic refit");
    await expect(page.getByRole("link", { name: "Edit period" })).toHaveCount(0);
    await page.goto(`${page.url()}/edit`);
    await expect(page.getByRole("heading", { name: "Forbidden" })).toBeVisible();
  });
});
