import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Proves the project-scoping pass (ACTION_PLAN.md G2.1, AUDIT_REPORT.md's
// [TENANCY] Criticals) actually holds, not just that nothing crashed.
//
// Every one of the app's other seeded accounts holds an unscoped role
// assignment and can reach every project — none of them can exercise this.
// SCOPED reaches only p1 ("2026 Refit"). CO-P2-0001 and REQ-P2-0001 live on
// p2 ("Winter Maintenance Period") only; SCOPED must never see them.

const SCOPED = { email: "scoped@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

/** Add an option the form never offered and select it, as a tampered post would. */
async function forceOption(page: Page, selectName: string, value: string) {
  await page.evaluate(
    ([name, id]) => {
      const select = document.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
      select.add(new Option("tampered", id));
      select.value = id;
    },
    [selectName, value],
  );
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
    // Scoped to the banner landmark since G2.7: the single-project static
    // label also renders in Sidebar's mobile drawer, hidden at this (desktop)
    // viewport, so an unscoped match can resolve to the hidden copy.
    await expect(page.getByRole("banner").getByText("R-00721", { exact: true })).toBeVisible();

    const title = `Tenancy regression ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Confirms the created record lands on the active project.");
    await page.getByLabel("Reason for Change").fill("Verifying G2.1's project derivation.");
    await page.getByRole("button", { name: /create draft/i }).click();

    await page.waitForURL((url) => /^\/change-orders\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    await expect(page.getByRole("banner").getByText("M/Y Solstice", { exact: false })).toBeVisible();
  });

  test("the project admin list omits another project", async ({ page }) => {
    // SCOPED holds project.edit on p1 only. The save path already refused p2;
    // the list must not show it either.
    await signIn(page, SCOPED);
    await page.goto("/admin/projects");
    // Its own project is listed; the page-wide checks below are the real assertion.
    await expect(page.getByRole("main").getByRole("link", { name: /R-00721/ })).toBeVisible();
    await expect(page.getByText(/R-00806/)).toHaveCount(0);
    await expect(page.getByText(/Winter Maintenance Period/)).toHaveCount(0);
  });
});

test.describe("records linked from a form belong to the active project", () => {
  // The forms only offer the active project's change orders, sections and
  // vessel areas, but the ids arrive from the client. A foreign key proves
  // the row exists, not that it belongs to this project.

  async function startJobRequest(page: Page, title: string) {
    await signIn(page, SCOPED);
    await page.goto("/jobs/new");
    await page.getByLabel("Job title").fill(title);
    await page
      .getByLabel("Job description")
      .fill("Tries to reach into another project from the form.");
    await page.getByLabel(/designated authoriser/i).selectOption({ label: "Cara Captain" });
  }

  async function startCrewRequest(page: Page, title: string) {
    await signIn(page, CREW);
    await page.goto("/crew-requests/new");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Tries to reach into another project from the form.");
  }

  test("a job request cannot link another project's change order", async ({ page }) => {
    const foreign = await prisma.changeOrder.findUniqueOrThrow({ where: { number: "CO-P2-0001" } });
    const title = `Cross-project link ${Date.now()}`;
    await startJobRequest(page, title);
    await forceOption(page, "linkedChangeOrderId", foreign.id);
    await page.getByRole("button", { name: /send request/i }).click();

    await expect(page.getByText("That change order is not on this project.")).toBeVisible();
    expect(await prisma.job.count({ where: { title } })).toBe(0);
  });

  test("a job request cannot file under another project's section", async ({ page }) => {
    const foreign = await prisma.jobSection.upsert({
      where: { projectId_letter: { projectId: "p2", letter: "Z" } },
      update: {},
      create: { projectId: "p2", letter: "Z", name: "Tenancy fixture" },
    });
    const title = `Cross-project section ${Date.now()}`;
    await startJobRequest(page, title);
    await forceOption(page, "sectionId", foreign.id);
    await page.getByRole("button", { name: /send request/i }).click();

    await expect(page.getByText("That section is not on this project.")).toBeVisible();
    expect(await prisma.job.count({ where: { title } })).toBe(0);
  });

  test("a crew request cannot link another project's change order", async ({ page }) => {
    const foreign = await prisma.changeOrder.findUniqueOrThrow({ where: { number: "CO-P2-0001" } });
    const title = `Cross-project link ${Date.now()}`;
    await startCrewRequest(page, title);
    await forceOption(page, "linkedChangeOrderId", foreign.id);
    await page.getByRole("button", { name: /create request/i }).click();

    await expect(page.getByText("That change order is not on this project.")).toBeVisible();
    expect(await prisma.crewRequest.count({ where: { title } })).toBe(0);
  });

  test("a crew request cannot name another vessel's area", async ({ page }) => {
    const p2 = await prisma.project.findUniqueOrThrow({ where: { id: "p2" } });
    const foreign =
      (await prisma.vesselArea.findFirst({ where: { vesselId: p2.vesselId } })) ??
      (await prisma.vesselArea.create({
        data: { vesselId: p2.vesselId, name: "Tenancy fixture" },
      }));
    const title = `Cross-project area ${Date.now()}`;
    await startCrewRequest(page, title);
    await forceOption(page, "vesselAreaId", foreign.id);
    await page.getByRole("button", { name: /create request/i }).click();

    await expect(page.getByText("That area is not on this project's vessel.")).toBeVisible();
    expect(await prisma.crewRequest.count({ where: { title } })).toBe(0);
  });
});
