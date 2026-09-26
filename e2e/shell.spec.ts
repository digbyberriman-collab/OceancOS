import { test, expect, type Page } from "@playwright/test";

// Credentials come from prisma/seed.ts.
const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("authentication", () => {
  test("redirects an anonymous visitor to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("publishes no credentials to an anonymous visitor", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    // The sign-in page once carried a "Demo access" panel printing a working
    // OWNER login. Nothing on this page may name an account or a password.
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("@oceancos.dev");
    expect(body).not.toContain("demo access");
    expect(body).not.toMatch(/password\s+password/);
  });

  test("rejects a wrong password without signing in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(PM.email);
    await page.getByLabel(/password/i).fill("not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/err=/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs a project manager in and back out", async ({ page }) => {
    await signIn(page, PM);
    await expect(page.getByRole("heading", { name: /project dashboard/i })).toBeVisible();
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/login");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("project switcher", () => {
  test("lists the seeded projects and remembers the choice", async ({ page }) => {
    await signIn(page, PM);

    const switcher = page.getByLabel("Active project");
    await expect(switcher).toBeVisible();

    const options = await switcher.locator("option").allTextContents();
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.join(" ")).toContain("R-00721");
    expect(options.join(" ")).toContain("R-00806");

    // Switch to the second project.
    const second = (await switcher.locator("option").nth(1).getAttribute("value"))!;
    await switcher.selectOption(second);
    await expect(switcher).toHaveValue(second);

    // The choice survives a full page load, because it lives on the session.
    await page.goto("/change-orders");
    await expect(page.getByLabel("Active project")).toHaveValue(second);
  });
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("replaces the fixed sidebar with a drawer below the desktop breakpoint", async ({ page }) => {
    // C12: a permanently visible 240px sidebar left about 87px of usable
    // width on a 375px phone, with no toggle anywhere to get it out of the
    // way and no way to reach the project switcher (also hidden below `md`
    // in the old TopBar). Both are closed here.
    await signIn(page, PM);
    await page.goto("/dashboard");

    await expect(page.locator("aside")).toBeHidden();
    await expect(
      page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    ).resolves.toBe(false);

    const hamburger = page.getByRole("button", { name: "Open menu" });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    // The drawer's own nav — the same destinations the desktop sidebar
    // shows, plus the project switcher, previously reachable only at `md`
    // and up.
    const drawerNav = page.getByRole("navigation").last();
    await expect(drawerNav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(drawerNav.getByRole("link", { name: "Quotes & requests" })).toBeVisible();
    // TopBar's own copy of the switcher (hidden at this width) still exists
    // in the DOM, so scope to the one the drawer actually shows.
    await expect(page.getByText("R-00721").locator("visible=true")).toHaveCount(1);

    // Following a link closes the drawer and navigates.
    await drawerNav.getByRole("link", { name: "Crew requests" }).click();
    await page.waitForURL("**/crew-requests");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation" })).toHaveCount(0);

    // Reopening and clicking the backdrop closes it without navigating.
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("button", { name: "Close navigation" })).toBeVisible();
    await page.mouse.click(350, 400); // outside the 288px-wide drawer panel
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page).toHaveURL(/\/crew-requests$/);
  });

  test("desktop sidebar and hamburger swap back above the breakpoint", async ({ page }) => {
    await signIn(page, PM);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");

    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
    // PM reaches a single seeded project, so the static-label branch of
    // ProjectSwitcher renders rather than the <select> — either way it must
    // be visible in the topbar again above the breakpoint, not just inside
    // the (now hidden) drawer.
    await expect(page.getByText("R-00721")).toBeVisible();
  });
});

test.describe("permissions", () => {
  test("hides financial data from crew", async ({ page }) => {
    await signIn(page, CREW);
    await expect(page.getByText(/don.t have access to financial data/i)).toBeVisible();

    await page.goto("/financials");
    await expect(page.getByText(/forbidden/i)).toBeVisible();
  });

  test("shows financial data to a project manager", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/financials");
    await expect(page.getByRole("heading", { name: /financials/i })).toBeVisible();
    await expect(page.getByText(/forbidden/i)).toHaveCount(0);
  });

  test("a refused page renders inside the shell, not as a blank crash", async ({ page }) => {
    // /change-orders/new calls assertPermission, which throws. Crew does not
    // hold change_order.create. Before the error boundary existed this threw
    // into nothing and the user got a blank page with no way back.
    await signIn(page, CREW);
    await page.goto("/change-orders/new");

    await expect(page.getByRole("heading", { name: /not permitted/i })).toBeVisible();
    await expect(page.getByText(/do not have permission/i)).toBeVisible();

    // The shell survives: the user is not stranded.
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("link", { name: /back to dashboard/i })).toBeVisible();

    // And the permission key is not disclosed to the browser.
    expect(await page.locator("body").innerText()).not.toContain("change_order.create");

    await page.getByRole("link", { name: /back to dashboard/i }).click();
    await page.waitForURL("**/dashboard");
  });
});

test.describe("uploads", () => {
  test("refuses to sign an upload for an anonymous visitor", async ({ request }) => {
    const res = await request.post("/api/uploads/sign", {
      data: {
        projectId: "p1",
        resource: "Job",
        resourceId: "j1",
        filename: "x.pdf",
        contentType: "application/pdf",
        size: 10,
      },
    });
    expect(res.status()).toBe(401);
  });

  test("stores a file, but refuses to serve it back until it is attached to a real record", async ({
    page,
  }) => {
    await signIn(page, PM);

    // The whole round trip runs in the browser so the session cookie is used
    // exactly as a real upload would use it.
    const result = await page.evaluate(async () => {
      const body = "hello from the yard";
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "p1",
          resource: "Job",
          resourceId: "j1",
          filename: "Survey report.pdf",
          contentType: "application/pdf",
          size: body.length,
        }),
      });
      if (!signRes.ok) return { step: "sign", status: signRes.status };

      const signed = await signRes.json();
      const putRes = await fetch(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body,
      });
      if (!putRes.ok) return { step: "put", status: putRes.status, key: signed.key };

      const getRes = await fetch(`/api/uploads/local?key=${encodeURIComponent(signed.key)}`);
      return { step: "done", status: getRes.status, key: signed.key };
    });

    expect(result.step).toBe("done");
    // Keys are namespaced by project and resource, with the filename sanitised.
    expect(result.key).toMatch(/^projects\/p1\/Job\/j1\/[a-f0-9]{16}-survey-report\.pdf$/);
    // Signing and storing a file no longer entitles anyone to read it back —
    // only a real Attachment row pointing at it does (G2.5, C3). This key was
    // never attached to anything, so it reads exactly like one that was never
    // uploaded at all.
    expect(result.status).toBe(404);
  });

  test("serves a file back once it is attached to a job the caller can reach", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/jobs/new");

    await page.getByLabel("Job title").fill(`Upload round trip ${Date.now()}`);
    await page
      .getByLabel("Job description")
      .fill("Confirm an attachment can be read back once it belongs to a real job.");
    await page.getByLabel(/designated authoriser/i).selectOption({ label: "Cara Captain" });

    // A real browse-and-upload through FileDrop's own file input — not a raw
    // fetch — so this exercises exactly the path a user's browser takes:
    // sign, PUT to storage, then post the resulting key as a hidden field
    // alongside the rest of the form.
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "survey.txt", mimeType: "text/plain", buffer: Buffer.from("hello from the yard") });
    const keyInput = page.locator('input[name="attachments"]');
    await expect(keyInput).toHaveCount(1, { timeout: 10_000 });
    const { key } = JSON.parse(await keyInput.inputValue());
    expect(key).toMatch(/^projects\/p1\/Job\/new\/[a-f0-9]{16}-survey\.txt$/);

    await page.getByRole("button", { name: /send request/i }).click();
    await page.waitForURL((url) => /^\/jobs\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));

    const status = await page.evaluate(
      async (k) => (await fetch(`/api/uploads/local?key=${encodeURIComponent(k)}`)).status,
      key
    );
    expect(status).toBe(200);
  });

  test("rejects a disallowed file type", async ({ page }) => {
    await signIn(page, PM);
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "p1",
          resource: "Job",
          resourceId: "j1",
          filename: "payload.sh",
          contentType: "application/x-sh",
          size: 10,
        }),
      });
      return res.status;
    });
    expect(status).toBe(415);
  });

  test("rejects an upload to a project the user cannot reach", async ({ page }) => {
    await signIn(page, PM);
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "does-not-exist",
          resource: "Job",
          resourceId: "j1",
          filename: "x.pdf",
          contentType: "application/pdf",
          size: 10,
        }),
      });
      return res.status;
    });
    expect(status).toBe(403);
  });

  test("rejects a local upload with a forged token", async ({ page }) => {
    await signIn(page, PM);
    const status = await page.evaluate(async () => {
      const expires = Math.floor(Date.now() / 1000) + 600;
      const url = `/api/uploads/local?key=${encodeURIComponent(
        "projects/p1/Job/j1/aaaaaaaaaaaaaaaa-x.pdf"
      )}&expires=${expires}&token=${"0".repeat(32)}`;
      const res = await fetch(url, { method: "PUT", body: "nope" });
      return res.status;
    });
    expect(status).toBe(403);
  });
});

test.describe("dashboard charts", () => {
  test("renders the status donut, the progress rings and the value chart", async ({ page }) => {
    await signIn(page, PM);

    // Donut: seeded change orders, with the count in the centre and a legend
    // so identity never rests on colour alone.
    const donut = page.getByRole("img", { name: /draft and submitted/i });
    await expect(donut).toBeVisible();
    await expect(page.getByText("change orders", { exact: true })).toBeVisible();
    // exact, because the SVG's accessible title repeats every label.
    await expect(page.getByText("Approved and in progress", { exact: true })).toBeVisible();

    // Progress rings: work against the yard period.
    await expect(page.getByRole("img", { name: /work .* per cent complete/i })).toBeVisible();
    await expect(page.getByText("Time elapsed")).toBeVisible();

    // Step area with its table view, so every value is reachable without a mouse.
    await expect(page.getByText("Cumulative change-order value")).toBeVisible();
    await page.getByText("View as table").click();
    await expect(page.getByRole("columnheader", { name: "Approved" })).toBeVisible();
  });

  test("hides the value chart from a user without financial access", async ({ page }) => {
    await signIn(page, CREW);
    await expect(page.getByText("Cumulative change-order value")).toHaveCount(0);
  });
});

test.describe("text search", () => {
  // SQLite matched case-insensitively for free; PostgreSQL does not. Every
  // `contains` filter carries mode: "insensitive" so the move did not quietly
  // break search, and these assertions keep it that way.
  test("matches regardless of the case typed", async ({ page }) => {
    await signIn(page, PM);

    for (const query of ["teak", "TEAK", "TeAk"]) {
      await page.goto(`/change-orders?q=${query}`);
      await expect(
        page.getByRole("link", { name: /Sundeck teak caulking/i }),
        `searching for ${query}`
      ).toBeVisible();
    }
  });

  test("matches case-insensitively from the global search too", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/search?q=STABILISER");
    await expect(page.getByText(/Stabiliser fin bearing overhaul/i).first()).toBeVisible();
  });
});
