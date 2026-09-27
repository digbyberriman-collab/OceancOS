import { test, expect, type Page } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

// Lost-update races, reproduced deterministically rather than by firing two
// requests and hoping they interleave.
//
// The test holds a row lock itself: inside its own transaction it writes the
// competing status change and does not commit. Postgres still shows the
// server the old status (MVCC), so the action reads it, passes its legality
// check, and then blocks on the row when it tries to write. Once
// pg_stat_activity shows the server waiting on that lock, the test commits.
// An update keyed on the id alone then goes ahead over the committed change;
// one keyed on the status it read re-checks that predicate against the new
// row, matches nothing, and the action reports the conflict.

const prisma = new PrismaClient();

const PM = { email: "pm@oceancos.dev", password: "password" };
const YARD = { email: "yard@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

/** Wait until another backend is blocked on a row lock this transaction holds. */
async function waitForBlockedWriter(tx: Prisma.TransactionClient) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const [{ n }] = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
    if (n > 0) return;
    if (Date.now() > deadline) throw new Error("The server never blocked on the held row");
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Run `competingWrite` in a transaction, trigger the action while that write
 * is uncommitted, and commit once the action is blocked behind it.
 */
async function raceAgainst(
  competingWrite: (tx: Prisma.TransactionClient) => Promise<unknown>,
  triggerAction: () => Promise<unknown>,
) {
  await prisma.$transaction(
    async (tx) => {
      await competingWrite(tx);
      await triggerAction();
      await waitForBlockedWriter(tx);
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("a status change that lands mid-action is not overwritten", () => {
  test("issuing a quote does not reprice a job cancelled in the meantime", async ({ page }) => {
    const project = await prisma.project.findUniqueOrThrow({ where: { code: "R-00721" } });
    const pm = await prisma.user.findUniqueOrThrow({ where: { email: "pm@oceancos.dev" } });
    const suffix = String(Date.now()).slice(-6);
    const code = `D.${suffix.slice(0, 4)}.${suffix.slice(4)}`;
    const job = await prisma.job.create({
      data: {
        projectId: project.id,
        code,
        groupCode: code.slice(0, 6),
        title: `Race fixture ${suffix}`,
        description: "A sent quote the yard is revising while the client cancels it.",
        status: "QUOTE_SENT",
        contractType: "CONTRACT",
        pricingBasis: "FIXED",
        currency: project.currency,
        total: 300,
        validityDays: 14,
        quoteDeliveredAt: new Date(),
        createdById: pm.id,
        updatedById: pm.id,
        lines: {
          create: [
            {
              sort: 0,
              description: "Skilled worker — mechanic",
              quantity: 4,
              unit: "HR",
              unitPrice: 75,
              total: 300,
            },
          ],
        },
      },
    });

    await signIn(page, YARD);
    await page.goto(`/jobs/${job.id}/quote`);
    await page.getByLabel("Line 1 quantity").fill("6");

    await raceAgainst(
      (tx) => tx.$executeRaw`UPDATE "Job" SET "status" = 'CANCELLED_QUOTE' WHERE "id" = ${job.id}`,
      () => page.getByRole("button", { name: /send revised quote/i }).click(),
    );

    await expect(page.getByRole("heading", { name: "Changed by someone else" })).toBeVisible();

    const after = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      include: { lines: true },
    });
    expect(after.status).toBe("CANCELLED_QUOTE");
    expect(after.total.toString()).toBe("300");
    expect(after.lines.map((l) => l.quantity.toString())).toEqual(["4"]);
  });
  test("editing a change order does not rewrite one submitted in the meantime", async ({
    page,
  }) => {
    await signIn(page, PM);
    await page.goto("/change-orders/new");
    const title = `Race fixture ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("A draft being edited while someone submits it.");
    await page.getByLabel("Reason for Change").fill("Reproducing the edit/submit race.");
    await page.getByLabel("Estimated Cost (EUR)").fill("1000");
    await page.getByRole("button", { name: /create draft/i }).click();
    await page.waitForURL(
      (url) => /^\/change-orders\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    );
    const id = new URL(page.url()).pathname.split("/").pop()!;

    await page.getByRole("link", { name: /edit details/i }).click();
    await page.waitForURL(/\/edit$/);
    await page.getByLabel("Title").fill(`${title} (edited)`);
    await page.getByLabel(/requires class review/i).check();

    await raceAgainst(
      (tx) => tx.$executeRaw`UPDATE "ChangeOrder" SET "status" = 'SUBMITTED' WHERE "id" = ${id}`,
      () => page.getByRole("button", { name: /save changes/i }).click(),
    );

    await expect(page.getByRole("heading", { name: "Changed by someone else" })).toBeVisible();

    const after = await prisma.changeOrder.findUniqueOrThrow({
      where: { id },
      include: { approvals: { select: { stage: true } } },
    });
    expect(after.status).toBe("SUBMITTED");
    expect(after.title).toBe(title);
    expect(after.needsClassReview).toBe(false);
    expect(after.approvals.map((a) => a.stage)).not.toContain("CLASS");
  });
});
