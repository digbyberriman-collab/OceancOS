import { test, expect } from "@playwright/test";

// AUDIT_REPORT.md's Critical C12 — the sidebar was a permanently visible
// 240px column with no way to reach any other page below ~600px. Fixed by
// ACTION_PLAN.md's G2.7: an off-canvas drawer below Tailwind's `md`
// (768px) breakpoint, toggled from TopBar's hamburger button.

const PM = { email: "pm@oceancos.dev", password: "password" };

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE-class

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(PM.email);
    await page.getByLabel(/password/i).fill(PM.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/dashboard");
  }

  test("the drawer starts closed and the hamburger opens it", async ({ page }) => {
    await signIn(page);

    const drawer = page.getByTestId("mobile-nav-drawer");
    await expect(drawer).toHaveClass(/-translate-x-full/);

    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(drawer).toHaveClass(/translate-x-0/);
    await expect(page.getByRole("link", { name: "Change orders", exact: true })).toBeVisible();
  });

  test("clicking a nav link navigates and closes the drawer", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: /open menu/i }).click();

    await page.getByRole("link", { name: "Change orders", exact: true }).click();
    await page.waitForURL("**/change-orders");

    await expect(page.getByTestId("mobile-nav-drawer")).toHaveClass(/-translate-x-full/);
  });

  test("clicking the backdrop closes the drawer without navigating", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(page.getByTestId("mobile-nav-drawer")).toHaveClass(/translate-x-0/);

    // The backdrop is the fixed, full-screen overlay behind the drawer —
    // click its far corner so the click can't land on the drawer itself.
    await page.mouse.click(360, 20);

    await expect(page.getByTestId("mobile-nav-drawer")).toHaveClass(/-translate-x-full/);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("the close button inside the drawer also closes it", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: /open menu/i }).click();
    await page.getByRole("button", { name: /close menu/i }).click();
    await expect(page.getByTestId("mobile-nav-drawer")).toHaveClass(/-translate-x-full/);
  });

  test("the project switcher appears inside the drawer, not nowhere", async ({ page }) => {
    // PM reaches two seeded projects — the switcher renders as a real
    // <select>, not the single-project static label. Before G2.7 this had
    // no mobile equivalent at all (ui-ux's separate finding).
    await signIn(page);
    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(page.getByTestId("mobile-nav-drawer").getByLabel("Active project")).toBeVisible();
  });
});

test.describe("desktop navigation is unchanged", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("no hamburger button, and the sidebar is always in place", async ({ page }) => {
    await test.step("sign in", async () => {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(PM.email);
      await page.getByLabel(/password/i).fill(PM.password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("**/dashboard");
    });

    await expect(page.getByRole("button", { name: /open menu/i })).toBeHidden();
    await expect(page.getByRole("link", { name: "Change orders", exact: true })).toBeVisible();
  });
});
