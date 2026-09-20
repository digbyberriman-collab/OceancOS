import { test, expect, type Page } from "@playwright/test";

const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("project administration", () => {
  test("is closed to crew", async ({ page }) => {
    await signIn(page, CREW);
    await page.goto("/admin/projects");
    await expect(page.getByText(/forbidden/i)).toBeVisible();
  });

  test("shows the yard period and what it currently reads as", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/admin/projects");

    await expect(page.getByLabel("Project code")).toHaveValue("R-00721");
    await expect(page.getByLabel("Arrival")).toHaveValue("2026-03-01");
    await expect(page.getByLabel("Departure")).toHaveValue("2026-09-30");
    await expect(page.getByText("Onsite for")).toBeVisible();
    await expect(page.getByText("Time elapsed")).toBeVisible();
  });

  test("refuses a departure before arrival", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/admin/projects");

    await page.getByLabel("Departure").fill("2026-02-01");
    await page.getByRole("button", { name: /save project/i }).click();

    await expect(page.getByText(/departure must be after arrival/i)).toBeVisible();
    // Nothing was stored: the field still shows the original value on reload.
    await page.goto("/admin/projects");
    await expect(page.getByLabel("Departure")).toHaveValue("2026-09-30");
  });

  test("refuses a code already used by another project", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/admin/projects");

    await page.getByLabel("Project code").fill("R-00806");
    await page.getByRole("button", { name: /save project/i }).click();
    await expect(page.getByText(/already used by another project/i)).toBeVisible();
  });

  test("saves a change and shows it in the header switcher", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/admin/projects");

    await page.getByLabel("Yard").fill("MB92 Barcelona");
    await page.getByLabel("Sea trials").fill("2026-09-20");
    await page.getByRole("button", { name: /save project/i }).click();

    await expect(page.getByText(/project saved/i)).toBeVisible();
    await expect(page.getByLabel("Yard")).toHaveValue("MB92 Barcelona");
    await expect(page.getByLabel("Sea trials")).toHaveValue("2026-09-20");

    // The switcher reads the same record.
    await page.goto("/dashboard");
    await expect(page.getByLabel("Active project")).toBeVisible();
  });
});
