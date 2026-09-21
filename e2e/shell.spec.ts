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

  test("signs, stores and serves a file back", async ({ page }) => {
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
      return {
        step: "done",
        status: getRes.status,
        key: signed.key,
        text: await getRes.text(),
      };
    });

    expect(result.step).toBe("done");
    expect(result.status).toBe(200);
    expect(result.text).toBe("hello from the yard");
    // Keys are namespaced by project and resource, with the filename sanitised.
    expect(result.key).toMatch(/^projects\/p1\/Job\/j1\/[a-f0-9]{16}-survey-report\.pdf$/);
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
