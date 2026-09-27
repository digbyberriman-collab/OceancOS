import { test, expect, type Page } from "@playwright/test";

// The C2 reproduction from AUDIT_REPORT.md, run against the real server
// action rather than only unit-tested. Before ACTION_PLAN.md's G2.3, the
// only thing keeping a job out of CLIENT_ACCEPTED via the plain transition
// action was NOT_OFFERED — a UI filter with no server-side counterpart. The
// finding's own words: "the action id is in the client bundle and can be
// re-posted with to=CLIENT_ACCEPTED." This does exactly that: it takes a
// legitimate, rendered transition form (Cancel quote), tampers the hidden
// `to` field in the DOM before submitting, and submits it through the real
// bound server action — the same shape of request a modified client would
// send. It must be refused.

const PM = { email: "pm@oceancos.dev", password: "password" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test("transitionJob refuses CLIENT_ACCEPTED even when the form is tampered to send it", async ({ page }) => {
  await signIn(page, PM);
  // I.2200.20, seeded QUOTE_SENT — CLIENT_ACCEPTED is a legal target of
  // QUOTE_SENT in JOB_LEGAL_TRANSITIONS, so this is not testing an edge the
  // state machine would refuse anyway; the ceremony gate has to do the work.
  await page.goto("/jobs?view=pending");
  await page.getByRole("link", { name: /Additional exterior covers/ }).click();
  await page.waitForURL(/\/jobs\/[^/]+$/);

  // The only offered transition on a QUOTE_SENT job is "Cancel quote" — its
  // form is real, bound to the real transitionJob action, and its hidden
  // `to` field is exactly what a tampered client would edit.
  const cancelButton = page.getByRole("button", { name: /cancel quote/i });
  await expect(cancelButton).toBeVisible();
  const form = page.locator("form", { has: cancelButton });
  await expect(form.locator('input[name="to"]')).toHaveValue("CANCELLED_QUOTE");

  await form.evaluate((el: HTMLFormElement) => {
    (el.querySelector('input[name="to"]') as HTMLInputElement).value = "CLIENT_ACCEPTED";
  });
  await cancelButton.click();

  // Refused — rendered inside the shell (G1.1's boundary), not a crash, and
  // the job must still read QUOTE_SENT, not CLIENT_ACCEPTED.
  await expect(page.getByText(/confirmation code/i)).toBeVisible();
  // The form submission never navigated — the boundary rendered in place at
  // the same URL (G1.1) — so a plain reload is enough to confirm the write
  // never happened, without needing to re-navigate anywhere.
  await page.reload();
  await expect(page.getByText("Quote sent", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Client accepted", { exact: true })).toHaveCount(0);
});
