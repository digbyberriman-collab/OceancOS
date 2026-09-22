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

  test("a rejected request keeps what was typed, not a blank form (ACTION_PLAN.md G3.6)", async ({
    page,
  }) => {
    await signIn(page, PM);
    await page.goto("/jobs/new");
    const title = `Preserved on failure ${Date.now()}`;
    await page.getByLabel("Job title").fill(title);
    await page.getByLabel("Job description").fill("Description long enough to pass validation.");
    await page.getByLabel("Your job reference").fill("MY-REF-001");
    // No authoriser chosen. The select is `required`, mirroring the
    // server's own check (ACTION_PLAN.md G3.6) — bypass that client-side
    // gate directly, the way a request forged outside the browser would,
    // so this exercises the server rejecting it rather than the browser.
    await page.getByLabel(/designated authoriser/i).evaluate((el) => el.removeAttribute("required"));
    await page.getByRole("button", { name: /send request/i }).click();

    await expect(page).toHaveURL(/\/jobs\/new$/);
    await expect(page.getByLabel("Job title")).toHaveValue(title);
    await expect(page.getByLabel("Job description")).toHaveValue(
      "Description long enough to pass validation."
    );
    await expect(page.getByLabel("Your job reference")).toHaveValue("MY-REF-001");

    // A later, unrelated visit to the same form starts blank again.
    await page.goto("/jobs/new");
    await expect(page.getByLabel("Job title")).toHaveValue("");
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

  test("a whitespace-only comment is refused, not silently dropped (ACTION_PLAN.md G3.6)", async ({
    page,
  }) => {
    await signIn(page, PM);
    await page.goto("/jobs?view=accepted");
    await page.getByRole("link", { name: /Valve overhauling/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);

    await page.getByLabel(/add a comment/i).fill("   ");
    await page.getByRole("button", { name: /send message/i }).click();
    await expect(page.getByText(/write something before posting/i)).toBeVisible();
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

  test("a rejected quote keeps every line, and cites the row that's actually wrong (ACTION_PLAN.md G3.6)", async ({
    page,
  }) => {
    const title = `Quote form preservation ${Date.now()}`;

    await signIn(page, PM);
    await page.goto("/jobs/new");
    await page.getByLabel("Job title").fill(title);
    await page.getByLabel("Job description").fill("Enough detail to pass the description minimum.");
    await page.getByLabel(/designated authoriser/i).selectOption({ label: "Cara Captain" });
    await page.getByRole("button", { name: /send request/i }).click();
    await page.waitForURL((url) => /^\/jobs\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    const jobUrl = page.url();

    await signOut(page);
    await signIn(page, YARD);
    await page.goto(`${jobUrl}/quote`);

    await page.getByLabel("Job code").fill("D.0400.30");
    await page.getByLabel("Line 1 description").fill("Skilled worker — rigger");
    await page.getByLabel("Line 1 quantity").fill("4");
    await page.getByLabel("Line 1 unit price").fill("55");
    // Row 2 stays blank — the filter that skips it is exactly what used to
    // throw off the row number reported for row 3.
    await page.getByLabel("Line 3 description").fill("Materials");
    // A negative quantity is what LineSchema actually rejects — bypass the
    // client-side min="0" mirror the same way a forged request would, so
    // this exercises the server's own check rather than the browser's.
    await page.getByLabel("Line 3 quantity").evaluate((el) => el.removeAttribute("min"));
    await page.getByLabel("Line 3 quantity").fill("-2");
    await page.getByLabel("Line 3 unit price").fill("10");
    await page.getByLabel("One per line", { exact: false }).first().fill("Painting is out of scope.");
    await page.getByRole("button", { name: /send quote/i }).click();

    await expect(page).toHaveURL(`${jobUrl}/quote`);
    await expect(page.getByText(/line 3 is incomplete/i)).toBeVisible();

    // Every row survives, not just the one that failed — blank row 2 included.
    await expect(page.getByLabel("Job code")).toHaveValue("D.0400.30");
    await expect(page.getByLabel("Line 1 description")).toHaveValue("Skilled worker — rigger");
    await expect(page.getByLabel("Line 1 quantity")).toHaveValue("4");
    await expect(page.getByLabel("Line 1 unit price")).toHaveValue("55");
    await expect(page.getByLabel("Line 2 description")).toHaveValue("");
    await expect(page.getByLabel("Line 3 description")).toHaveValue("Materials");
    await expect(page.getByLabel("Line 3 quantity")).toHaveValue("-2");
    await expect(page.getByLabel("One per line", { exact: false }).first()).toHaveValue(
      "Painting is out of scope."
    );
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
