import { test, expect, type Page } from "@playwright/test";

// The seeded walkthrough is fictional and parked on Draak (src/lib/demo/).
// It must say what it is wherever it is shown, and never mix into a real
// vessel's lists: projectScope() covers only the active project's side of
// the demo line.

const PM = { email: "pm@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

/** Pick a project in the header switcher and wait for the choice to persist. */
async function switchTo(page: Page, codeText: string) {
  const switcher = page.getByRole("banner").getByLabel("Active project");
  const value = (await switcher
    .locator("option", { hasText: codeText })
    .first()
    .getAttribute("value"))!;
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST"),
    switcher.selectOption(value),
  ]);
  await expect(switcher).toHaveValue(value);
}

test.describe("demo workspace", () => {
  test("is announced while a demo project is active, and on the vessel it is parked on", async ({
    page,
  }) => {
    await signIn(page, PM);
    const banner = page.getByRole("note", { name: "Demo workspace" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("fictional walkthrough data, parked on Draak");
    await expect(page.getByText("Demo", { exact: true }).first()).toBeVisible();
  });

  test("is grouped apart in the project switcher", async ({ page }) => {
    await signIn(page, PM);
    const switcher = page.getByRole("banner").getByLabel("Active project");
    const group = switcher.locator('optgroup[label="Demo workspace — fictional"] option');
    await expect(group).toHaveCount(2);
    await expect(group.first()).toContainText("DEMO-01");
  });

  test("is left out of a real project's lists, and the banner goes with it", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/change-orders");
    await expect(page.getByText("CO-0002").first()).toBeVisible();

    await switchTo(page, "Y701");
    await expect(page.getByRole("note", { name: "Demo workspace" })).toHaveCount(0);
    await page.goto("/change-orders");
    await expect(page.getByText("CO-0002")).toHaveCount(0);
    await page.goto("/crew-requests");
    await expect(page.getByText("REQ-0001")).toHaveCount(0);
  });

  test("stamps its exports, and a real project's export carries no stamp", async ({ page }) => {
    await signIn(page, PM);
    // Fetched in the page: the session cookie is Secure, which the browser
    // sends to 127.0.0.1 but Playwright's own request client does not.
    const csv = () =>
      page.evaluate(async () => (await fetch("/api/export/change-orders?format=csv")).text());
    const demo = await csv();
    const [header, ...rows] = demo.split("\r\n");
    expect(header.startsWith("Data,")).toBe(true);
    // Every record row is stamped; the totals row, last, is labelled instead.
    const records = rows.filter((row) => !row.startsWith("Total,"));
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((row) => row.startsWith("DEMO — fictional,"))).toBe(true);

    await switchTo(page, "Y701");
    const real = await csv();
    expect(real).not.toContain("DEMO");
    expect(real.startsWith("Number,")).toBe(true);
  });

  test("marks a demo record opened from a real project", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/change-orders");
    await page
      .getByRole("link", { name: /CO-0002/ })
      .first()
      .click();
    await page.waitForURL(/\/change-orders\/[^/]+$/);
    const url = page.url();

    await switchTo(page, "Y701");
    await page.goto(url);
    await expect(page.getByRole("heading", { name: /CO-0002/ })).toBeVisible();
    await expect(page.getByRole("main").getByText("Demo", { exact: true })).toBeVisible();
  });
});
