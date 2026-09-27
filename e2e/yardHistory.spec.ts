import { test, expect, type Page } from "@playwright/test";

// Each vessel's yard history, from the committed yard-period register:
// what was done, where and when, at the precision it was published.

const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

async function openVessel(page: Page, name: string) {
  await page.goto("/vessels");
  await page.getByRole("link", { name, exact: true }).click();
  await page.waitForURL(/\/vessels\/[^/]+$/);
}

const history = (page: Page) => page.locator("#history");

test.describe("yard history", () => {
  test("lists a vessel's periods newest first, with the dates as published", async ({ page }) => {
    await signIn(page, PM);
    await openVessel(page, "Batello");
    await expect(history(page).getByText("6 periods · 2012–2025")).toBeVisible();
    const periods = history(page).locator("ol > li");
    await expect(periods).toHaveCount(6);
    await expect(periods.first()).toContainText("2025");
    await expect(periods.last()).toContainText("2012-Q2");
    await expect(periods.last()).toContainText("as Amevi");
    await expect(
      history(page).getByText("Yard not identified in public sources").first(),
    ).toBeVisible();
  });

  test("counts each vessel's periods in the fleet register, with its latest", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/vessels");
    // The register's own summary sheet gives 2019 as Vibrant Curiosity's latest
    // period; its master rows run to 2023, and those are what is shown.
    const row = page.locator("table tbody tr").filter({ hasText: "Vibrant Curiosity" });
    await expect(row.getByRole("link", { name: "6", exact: true })).toBeVisible();
    await expect(row).toContainText("2023");
    const shodan = page.locator("table tbody tr").filter({ hasText: "SHODAN" });
    await expect(shodan.locator("td").nth(3)).toHaveText("0");
  });

  test("says when no period was found, as a gap in the evidence", async ({ page }) => {
    await signIn(page, PM);
    await openVessel(page, "SHODAN");
    await expect(history(page)).toContainText("No sufficiently reliable post-delivery yard period");
    await expect(history(page)).toContainText("not proof that no work was done");
  });

  test("keeps the claims the register left out on the vessel", async ({ page }) => {
    await signIn(page, PM);
    await openVessel(page, "Koru");
    await expect(history(page).getByText("Claims considered and left out")).toBeVisible();
    await expect(history(page).getByText("Weak 2023 La Ciotat claim")).toBeVisible();
  });

  test("opens a period's overview, its scope filed by discipline", async ({ page }) => {
    await signIn(page, PM);
    await openVessel(page, "KAOS");
    await history(page)
      .getByRole("link", { name: /Major transformational refit/ })
      .click();
    await page.waitForURL(/\/projects\/[^/]+$/);

    await expect(page.getByRole("heading", { name: "2019-03 – 2020-11" })).toBeVisible();
    await expect(page.getByText("as Jubilee")).toBeVisible();
    // The yard's boast is context, not electrical work.
    await expect(page.getByRole("heading", { name: "Electrical, AV/IT & navigation" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("heading", { name: "Interior & guest areas" })).toBeVisible();
    await expect(
      page.getByText("Approximately 1,500m² of interior renewed and reconfigured", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("€20m–€50m+")).toBeVisible();
    await expect(page.getByText(/Planning estimate — not historical spend/)).toBeVisible();
    await expect(page.getByText("Undisclosed")).toBeVisible();
  });

  test("hides the planning band from a role without financial access", async ({ page }) => {
    await signIn(page, CREW);
    await openVessel(page, "KAOS");
    await history(page)
      .getByRole("link", { name: /Major transformational refit/ })
      .click();
    await page.waitForURL(/\/projects\/[^/]+$/);
    await expect(
      page.getByText("Approximately 1,500m² of interior renewed and reconfigured", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("€20m–€50m+")).toHaveCount(0);
    await expect(page.getByText("Planning estimate")).toHaveCount(0);
  });

  test("takes no new work once opened, being a record", async ({ page }) => {
    test.slow();
    await signIn(page, PM);
    await openVessel(page, "KAOS");
    await history(page)
      .getByRole("link", { name: /Major transformational refit/ })
      .click();
    await page.waitForURL(/\/projects\/[^/]+$/);
    await page.getByRole("button", { name: "Open this project" }).click();
    await page.waitForURL("**/dashboard");

    const switcher = page.getByRole("banner").getByLabel("Active project");
    await expect(switcher.locator('optgroup[label="History (read-only)"] option')).toContainText([
      "Y714-2019",
    ]);

    await page.goto("/change-orders");
    await expect(page.getByRole("link", { name: "New Change Order" })).toHaveCount(0);
    await page.goto("/change-orders/new");
    await expect(page.getByRole("heading", { name: "This project is completed" })).toBeVisible();
    await page.goto("/jobs/new");
    await expect(page.getByRole("heading", { name: "This project is completed" })).toBeVisible();
  });
});
