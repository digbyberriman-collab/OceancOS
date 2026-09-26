import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const OUTBOX = resolve(process.env.MAIL_OUTBOX_DIR || "./.mail");

const PM = { email: "pm@oceancos.dev", password: "password" };
const CAPTAIN = { email: "captain@oceancos.dev", password: "password" };
const YARD = { email: "yard@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("**/login");
}

async function countTo(address: string): Promise<number> {
  try {
    const names = await readdir(OUTBOX);
    const messages = await Promise.all(
      names
        .filter((n) => n.endsWith(".json"))
        .map(async (n) => JSON.parse(await readFile(resolve(OUTBOX, n), "utf8")))
    );
    return messages.filter((m) => m.to === address).length;
  } catch {
    return 0;
  }
}

/** Wait for message number `expected` to reach an address and return its text. */
async function waitForEmail(address: string, expected: number): Promise<string> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const names = await readdir(OUTBOX).catch(() => [] as string[]);
    const messages = (
      await Promise.all(
        names
          .filter((n) => n.endsWith(".json"))
          .map(async (n) => JSON.parse(await readFile(resolve(OUTBOX, n), "utf8")))
      )
    )
      .filter((m) => m.to === address)
      .sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));

    if (messages.length >= expected) return messages[expected - 1].text as string;
    if (Date.now() > deadline) {
      throw new Error(`No email ${expected} for ${address} (have ${messages.length})`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

test.describe("quotes list", () => {
  test("splits the same object across The Bridge's sub-views", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=accepted");

    await expect(page.getByRole("heading", { name: /quotes & requests/i })).toBeVisible();
    // Groups are headed by the code group, as a yard quote pack reads.
    await expect(page.getByRole("heading", { name: "D.0130", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Valve overhauling/ })).toBeVisible();

    // A pending quote is not in the accepted view.
    await expect(page.getByRole("link", { name: /Additional exterior covers/ })).toHaveCount(0);
    await page.goto("/jobs?view=pending");
    await expect(page.getByRole("link", { name: /Additional exterior covers/ })).toBeVisible();
  });

  test("flags a lapsed quote rather than hiding it", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=pending");
    // The wrapping job was quoted with five days' validity in the seed.
    await expect(page.getByText(/lapsed \d+ days ago/i).first()).toBeVisible();
  });

  test("filters by section and by search", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=worklist&section=E");
    await expect(page.getByRole("link", { name: /Oily water separator/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Anchor chain ranging/ })).toHaveCount(0);

    await page.goto("/jobs?view=worklist&q=anchor");
    await expect(page.getByRole("link", { name: /Anchor chain ranging/ })).toBeVisible();
  });

  test("is closed to a role without job access", async ({ page }) => {
    await signIn(page, { email: "finance@oceancos.dev", password: "password" });
    await page.goto("/jobs?view=worklist");
    // Finance can view jobs but cannot raise requests.
    await expect(page.getByRole("link", { name: /new quote request/i })).toHaveCount(0);
  });
});

test.describe("quote detail", () => {
  test("shows lines, exclusions, variation detail and both signatures", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=accepted");
    await page.getByRole("link", { name: /Emergency suction valve overhaul/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);

    await expect(page.getByText("Variation certificate", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Adjustment to invoicing terms/i)).toBeVisible();
    await expect(page.getByText(/50% on signature/i)).toBeVisible();
    await expect(page.getByText("Quote accepted", { exact: true })).toBeVisible();
    await expect(page.getByText("Yard countersigned", { exact: true })).toBeVisible();
  });

  test("keeps a message and a minute apart in the thread", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=accepted");
    await page.getByRole("link", { name: /Valve overhauling/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);

    await expect(page.getByText(/sea chest valves are included/i)).toBeVisible();
    await expect(page.getByText(/Agreed at the daily meeting/i)).toBeVisible();
    await expect(page.getByText("minute", { exact: true })).toBeVisible();
  });

  test("stars a job for this user only", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=accepted");
    await page.getByRole("link", { name: /Anchor chain ranging/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);

    await page.getByRole("button", { name: /^favourite$/i }).click();
    await expect(page.getByRole("button", { name: /favourited/i })).toBeVisible();

    await page.goto("/jobs?view=worklist&fav=1");
    await expect(page.getByRole("link", { name: /Anchor chain ranging/ })).toBeVisible();

    // Another user does not inherit the star.
    await signOut(page);
    await signIn(page, CAPTAIN);
    await page.goto("/jobs?view=worklist&fav=1");
    await expect(page.getByRole("link", { name: /Anchor chain ranging/ })).toHaveCount(0);
  });
});

test.describe("the commercial loop", () => {
  test("request, quote, accept with a code, countersign", async ({ page }) => {
    const title = `Sacrificial anode renewal ${Date.now()}`;

    // --- The vessel raises a request -----------------------------------
    await signIn(page, PM);
    await page.goto("/jobs/new");
    await page.getByLabel("Job title").fill(title);
    await page
      .getByLabel("Job description")
      .fill("Renew all sacrificial anodes on the rudder stocks and record thicknesses before and after.");
    await page.getByLabel(/designated authoriser/i).selectOption({ label: "Cara Captain" });
    await page.getByRole("button", { name: /send request/i }).click();

    await page.waitForURL((url) => /^\/jobs\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    const jobUrl = page.url();
    await expect(page.getByText("New request", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/not yet priced/i)).toBeVisible();

    // --- The yard prices it ---------------------------------------------
    await signOut(page);
    await signIn(page, YARD);
    await page.goto(`${jobUrl}/quote`);

    await page.getByLabel("Job code").fill("D.0400.20");
    await page.getByLabel("Valid for (days)").fill("14");
    await page.getByLabel("Line 1 description").fill("Skilled worker — rigger");
    await page.getByLabel("Line 1 quantity").fill("12");
    await page.getByLabel("Line 1 unit", { exact: true }).fill("HR");
    await page.getByLabel("Line 1 unit price").fill("67.50");
    await page.getByLabel("Line 2 description").fill("Anodes and fixings");
    await page.getByLabel("Line 2 quantity").fill("1");
    await page.getByLabel("Line 2 unit price").fill("1190");
    await page
      .getByLabel("One per line", { exact: false })
      .first()
      .fill("Renewal of rudder stock seals if found defective.");
    await page.getByRole("button", { name: /send quote/i }).click();

    await page.waitForURL(/\/jobs\/[^/]+$/);
    // 12 × 67.50 + 1190 = 2000
    await expect(page.getByText("€2,000").first()).toBeVisible();
    await expect(page.getByText("Quote sent", { exact: true }).first()).toBeVisible();

    // --- The authoriser accepts, with the emailed code -------------------
    await signOut(page);
    await signIn(page, CAPTAIN);
    const before = await countTo(CAPTAIN.email);
    await page.goto(`${jobUrl}/accept`);

    await expect(page.getByText(/authorises the yard/i)).toBeVisible();
    await page.getByRole("button", { name: /^accept quote$/i }).click();

    await expect(page.getByText(/six-digit code has been sent/i)).toBeVisible();
    const email = await waitForEmail(CAPTAIN.email, before + 1);
    const code = email.match(/confirmation code is (\d{6})/i)?.[1];
    expect(code, "the email carries a six-digit code").toBeTruthy();

    // A wrong code is refused and says how many attempts remain.
    await page.getByLabel(/confirmation code/i).fill("000000");
    await page.getByRole("button", { name: /^accept /i }).click();
    await expect(page.getByText(/attempts left/i)).toBeVisible();

    await page.getByLabel(/confirmation code/i).fill(code!);
    await page.getByRole("button", { name: /^accept /i }).click();

    await page.waitForURL(/\/jobs\/[^/]+\?accepted=1/);
    await expect(page.getByText("Client accepted", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/client action — accepted quote/i)).toBeVisible();

    // The code cannot be used twice.
    await page.goto(`${jobUrl}/accept`);
    await expect(page.getByText(/nothing to accept/i)).toBeVisible();

    // --- The yard countersigns -------------------------------------------
    await signOut(page);
    await signIn(page, YARD);
    await page.goto(jobUrl);
    await page.getByRole("button", { name: /countersign/i }).click();

    await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/works authorised/i)).toBeVisible();

    // Progress is the yard's to report.
    await page.getByLabel(/complete \(%\)/i).fill("45");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText("45%").first()).toBeVisible();
  });

  test("refuses to let a non-authoriser accept", async ({ page }) => {
    await signIn(page, CREW);
    await page.goto("/jobs?view=pending");
    await page.getByRole("link", { name: /Additional exterior covers/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);
    // Crew can see the quote but is offered no way to sign it.
    await expect(page.getByRole("link", { name: /review and accept/i })).toHaveCount(0);

    await page.goto(`${page.url()}/accept`);
    await expect(page.getByText(/not an authoriser/i)).toBeVisible();
  });
});

test.describe("workflow guardrails", () => {
  test("refuses a crafted request that posts CLIENT_ACCEPTED through the generic transition action", async ({
    page,
  }) => {
    // CLIENT_ACCEPTED must only be reachable through the acceptance ceremony
    // in jobs/[id]/accept/actions.ts (the confirmation-code flow exercised in
    // "the commercial loop" above) — never through the generic transitionJob
    // action a status button posts to. This was C2: transitionJob used to
    // accept CLIENT_ACCEPTED directly from anyone holding JOB_ACCEPT, which
    // CAPTAIN does. The fix (applyTransition's JOB_GENERIC_UNREACHABLE
    // refusal, G1.3) is unit-tested in tests/applyTransition.test.ts; this is
    // the end-to-end regression the plan calls for, posting the transition
    // the way a crafted request would rather than a real client ever could.
    await signIn(page, CAPTAIN);
    await page.goto("/jobs?view=pending");
    await page.getByRole("link", { name: /Additional exterior covers/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);
    const jobUrl = page.url();
    await expect(page.getByText("Quote sent", { exact: true }).first()).toBeVisible();

    // The only transition button CAPTAIN is offered here is "Cancel quote"
    // (JOB_CANCEL) — CLIENT_ACCEPTED and EXPIRED are never rendered as
    // buttons at all (JOB_GENERIC_UNREACHABLE). Forge the hidden `to` field
    // on that real, server-bound form before submitting it: the server
    // computes which permission `to` requires and whether `to` is
    // reachable this way entirely from what the request carries, not from
    // which button was drawn.
    const toInput = page.locator('input[name="to"][value="CANCELLED_QUOTE"]');
    await expect(toInput).toHaveCount(1);
    await toInput.evaluate((el: HTMLInputElement) => {
      el.value = "CLIENT_ACCEPTED";
    });
    await page.getByRole("button", { name: /cancel quote/i }).click();

    await expect(page.getByRole("heading", { name: /not permitted/i })).toBeVisible();
    await expect(page.getByText(/can only be reached its own way/i)).toBeVisible();

    // Nothing moved: reloading the job shows it still sitting at QUOTE_SENT,
    // not CLIENT_ACCEPTED.
    await page.goto(jobUrl);
    await expect(page.getByText("Quote sent", { exact: true }).first()).toBeVisible();
  });
});

test.describe("exports", () => {
  test("downloads the worklist as a workbook", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=worklist");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /spreadsheet/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^worklist-.*\.xlsx$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe("PK");
  });

  test("renders the print view a quote PDF is made from", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=accepted");
    await page.getByRole("link", { name: /Emergency suction valve overhaul/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);
    const id = page.url().split("/").pop()!;

    await page.goto(`/print/jobs/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("D.0130.20");
    await expect(page.getByText("Variation certificate details")).toBeVisible();
    await expect(page.getByText("Acceptance")).toBeVisible();
  });
});
