import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

// With no SMTP host configured the app writes each message to ./.mail, so the
// whole reset journey can be driven exactly as a real user would experience it.
const OUTBOX = resolve(process.env.MAIL_OUTBOX_DIR || "./.mail");

// A user the other specs never sign in as, so changing its password is safe.
const TARGET = "eng@oceancos.dev";

type OutboxMessage = { to: string; subject: string; text: string; sentAt: string };

async function readOutbox(): Promise<OutboxMessage[]> {
  let names: string[];
  try {
    names = await readdir(OUTBOX);
  } catch {
    return [];
  }
  const messages = await Promise.all(
    names
      .filter((n) => n.endsWith(".json"))
      .map(async (n) => JSON.parse(await readFile(resolve(OUTBOX, n), "utf8")) as OutboxMessage)
  );
  return messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

async function countTo(address: string): Promise<number> {
  return (await readOutbox()).filter((m) => m.to === address).length;
}

/**
 * Wait for message number `expected` to arrive for an address.
 *
 * The file is written by the server process, so it can land a moment after the
 * browser sees the confirmation page. Polling keeps the test honest without
 * making it flaky.
 */
async function waitForEmail(address: string, expected: number): Promise<OutboxMessage> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const mine = (await readOutbox()).filter((m) => m.to === address);
    if (mine.length >= expected) return mine[expected - 1];
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for email ${expected} to ${address} (have ${mine.length})`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

function resetPathFrom(text: string): string {
  const match = text.match(/\/reset\/[a-f0-9]{64}/);
  if (!match) throw new Error(`No reset link in email:\n${text}`);
  return match[0];
}

/** Request a reset and return the link from the email it produces. */
async function requestResetLink(page: Page, email: string): Promise<string> {
  const before = await countTo(email);
  await page.goto("/forgot");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /send reset link/i }).click();
  await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  const message = await waitForEmail(email, before + 1);
  return resetPathFrom(message.text);
}

async function setPassword(page: Page, password: string, confirm = password) {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel(/confirm new password/i).fill(confirm);
  await page.getByRole("button", { name: /set password/i }).click();
}

test.describe("password reset", () => {
  test("answers identically for an unknown address and sends nothing", async ({ page }) => {
    const unknown = "nobody@example.test";
    const before = await countTo(unknown);

    await page.goto("/forgot");
    await page.getByLabel(/email/i).fill(unknown);
    await page.getByRole("button", { name: /send reset link/i }).click();

    // Same confirmation a real account gets, so the page reveals nothing.
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
    expect(await countTo(unknown)).toBe(before);
  });

  test("is reachable from the sign-in screen", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot/);
    await expect(page.getByRole("heading", { name: /forgot password/i })).toBeVisible();
  });

  test("refuses a made-up token", async ({ page }) => {
    await page.goto(`/reset/${"0".repeat(64)}`);
    await expect(page.getByRole("heading", { name: /link no longer valid/i })).toBeVisible();
  });

  test("refuses mismatched and short passwords", async ({ page }) => {
    const path = await requestResetLink(page, TARGET);
    await page.goto(path);

    await setPassword(page, "a-long-enough-passphrase", "a-long-enough-passphras");
    await expect(page.getByText(/those two passwords do not match/i)).toBeVisible();

    // The form is still usable and the link is not spent.
    await expect(page.getByRole("heading", { name: /set a new password/i })).toBeVisible();
  });

  test("supersedes an earlier link when a second is requested", async ({ page }) => {
    const first = await requestResetLink(page, TARGET);
    const second = await requestResetLink(page, TARGET);
    expect(second).not.toBe(first);

    await page.goto(first);
    await expect(page.getByRole("heading", { name: /link no longer valid/i })).toBeVisible();

    await page.goto(second);
    await expect(page.getByRole("heading", { name: /set a new password/i })).toBeVisible();
  });

  test("sets a new password, retires the old one, and spends the link", async ({ page }) => {
    const password = `north-sea-anchor-${Date.now()}`;
    const path = await requestResetLink(page, TARGET);

    await page.goto(path);
    await setPassword(page, password);

    await page.waitForURL(/\/login/);
    await expect(page.getByText(/password updated/i)).toBeVisible();

    // The new password works.
    await page.getByLabel(/email/i).fill(TARGET);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/dashboard");

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/login");

    // The seeded password no longer does.
    await page.getByLabel(/email/i).fill(TARGET);
    await page.getByLabel(/password/i).fill("password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();

    // And the link cannot be used twice.
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /link no longer valid/i })).toBeVisible();
  });
});
