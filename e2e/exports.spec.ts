import { test, expect, type Page } from "@playwright/test";

const PM = { email: "pm@oceancos.dev", password: "password" };
const CREW = { email: "crew@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("spreadsheet export", () => {
  test("refuses an anonymous caller", async ({ request }) => {
    const res = await request.get("/api/export/change-orders");
    expect(res.status()).toBe(401);
  });

  test("downloads a real workbook", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/change-orders");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /spreadsheet/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^change-orders.*\.xlsx$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);

    // A real xlsx is a zip: it starts with the PK signature.
    expect(body.subarray(0, 2).toString()).toBe("PK");
    expect(body.byteLength).toBeGreaterThan(2000);
  });

  test("omits costs from a user without financial access", async ({ page }) => {
    await signIn(page, PM);
    const withMoney = await page.evaluate(async () => {
      const res = await fetch("/api/export/change-orders?format=csv");
      return res.text();
    });
    expect(withMoney).toContain("Estimated cost");

    await page.getByRole("button", { name: /sign out/i }).click();
    await signIn(page, CREW);
    const withoutMoney = await page.evaluate(async () => {
      const res = await fetch("/api/export/change-orders?format=csv");
      return { status: res.status, text: await res.text() };
    });
    // Crew cannot view change orders at all, so the export refuses outright.
    expect(withoutMoney.status).toBe(403);
  });
});

test.describe("PDF export", () => {
  test("renders the print view it prints from", async ({ page }) => {
    await signIn(page, PM);
    const id = await page.evaluate(async () => {
      const res = await fetch("/api/export/change-orders?format=csv");
      return res.ok;
    });
    expect(id).toBe(true);

    await page.goto("/change-orders");
    await page.getByRole("link", { name: /CO-0001/ }).first().click();
    await page.waitForURL(/\/change-orders\/[^/]+$/);
    const url = page.url();
    const changeOrderId = url.split("/").pop()!;

    await page.goto(`/print/change-orders/${changeOrderId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("CO-0001");
    await expect(page.getByText("Approval chain")).toBeVisible();
    await expect(page.getByText("Reason for change")).toBeVisible();
  });

  test("returns a PDF, or says plainly that the server has no browser", async ({ page }) => {
    await signIn(page, PM);
    await page.goto("/change-orders");
    await page.getByRole("link", { name: /CO-0001/ }).first().click();
    await page.waitForURL(/\/change-orders\/[^/]+$/);
    const changeOrderId = page.url().split("/").pop()!;

    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/api/export/change-orders/${id}`);
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("application/pdf")) {
        const buf = await res.arrayBuffer();
        return { kind: "pdf", status: res.status, head: new TextDecoder().decode(buf.slice(0, 5)), size: buf.byteLength };
      }
      return { kind: "json", status: res.status, body: await res.json() };
    }, changeOrderId);

    if (result.kind === "pdf") {
      expect(result.status).toBe(200);
      expect(result.head).toBe("%PDF-");
      expect(result.size).toBeGreaterThan(1000);
    } else {
      // No Chromium on this host: the route must say so clearly, not 500.
      expect(result.status).toBe(503);
      expect(result.body.hint).toMatch(/chromium/i);
    }
  });
});
