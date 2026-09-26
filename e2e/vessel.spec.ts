import { test, expect, type Page } from "@playwright/test";

// Credentials come from prisma/seed.ts; the vessels from the committed register.
const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

async function openDraak(page: Page) {
  await page.goto("/vessels");
  await page.getByRole("link", { name: "Draak", exact: true }).click();
  await page.waitForURL(/\/vessels\/[^/]+$/);
}

test.describe("vessel particulars", () => {
  test("show the active project's vessel, placeholders included", async ({ page }) => {
    await signIn(page, PM);

    const switcher = page.getByLabel("Active project");
    const draak = (await switcher.locator("option", { hasText: "Y709" }).getAttribute("value"))!;
    await switcher.selectOption(draak);
    await expect(switcher).toHaveValue(draak);

    await page.goto("/vessel");
    await expect(page.getByRole("heading", { name: "Draak" })).toBeVisible();
    await expect(page.getByText("1012086").first()).toBeVisible();
    await expect(page.getByText("92.9 m").first()).toBeVisible();
    // A field with no value still renders, as a placeholder.
    await expect(page.getByText("Not recorded").first()).toBeVisible();
    // Builder and database lengths differ; both are kept and the conflict is flagged.
    await expect(page.getByText(/other values? on record/).first()).toBeVisible();
    await expect(page.getByText("Post-2026 rebuild tonnage")).toBeVisible();
  });

  test("list every register vessel and the unmapped yard numbers", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/vessels");

    const yardNumbers = await page.locator("tbody tr td:first-child").allTextContents();
    expect(yardNumbers.filter((t) => /^Y7\d\d$/.test(t.trim()))).toHaveLength(22);
    await expect(page.getByText("Y713", { exact: true })).toBeVisible();
    await expect(page.getByText("Y725", { exact: true })).toBeVisible();
  });

  test("are read-only to crew", async ({ page }) => {
    await signIn(page, CREW);
    await openDraak(page);
    await expect(page.getByRole("link", { name: /edit particulars/i })).toHaveCount(0);

    await page.goto(`${page.url()}/edit`);
    await expect(page.getByText(/forbidden/i)).toBeVisible();
  });

  test("record an edit as a value and as evidence", async ({ page }) => {
    await signIn(page, PM);
    await openDraak(page);
    await page.getByRole("link", { name: /edit particulars/i }).click();
    await page.waitForURL(/\/edit$/);

    const port = `George Town ${Date.now()}`;
    await page.getByLabel("Port of registry").fill(port);
    await page.getByLabel("Source / basis").fill("Certificate of Registry (e2e)");
    await page.getByRole("button", { name: /save particulars/i }).click();

    await page.waitForURL(/saved=1/);
    await expect(page.getByText(port).first()).toBeVisible();
    const evidence = page.locator("#evidence-portOfRegistry");
    await expect(evidence.getByText("Certificate of Registry (e2e)").first()).toBeVisible();
    await expect(evidence.getByText("Entered").first()).toBeVisible();
  });

  test("refuse a bad IMO number", async ({ page }) => {
    await signIn(page, PM);
    await openDraak(page);
    await page.getByRole("link", { name: /edit particulars/i }).click();
    await page.waitForURL(/\/edit$/);

    // Seven digits passes the browser's pattern; the check digit is wrong.
    await page.getByLabel("IMO number").fill("1012087");
    await page.getByRole("button", { name: /save particulars/i }).click();
    await expect(page.getByText(/valid check digit/i)).toBeVisible();
  });

  test("will not close a data gap without the evidence that closed it", async ({ page }) => {
    await signIn(page, PM);
    await openDraak(page);

    const gap = page.locator("li", { hasText: "Post-2026 rebuild tonnage" });
    await gap.getByText("Update status").click();
    await gap.getByLabel("Status").selectOption("CLOSED");
    await gap.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/say what evidence closed the gap/i)).toBeVisible();
  });
});
