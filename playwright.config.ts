import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${PORT}`;

// Some sandboxes ship a Chromium build that does not match the one this
// Playwright version would download. Use the provisioned binary when it is
// there; otherwise let Playwright resolve its own.
//
// PLAYWRIGHT_CHROMIUM_PATH overrides the sandbox path, but CI does not rely
// on that fallback the way this comment used to imply: ci.yml's "Locate
// Chromium for the PDF renderer" step sets PLAYWRIGHT_CHROMIUM_PATH itself,
// for the app's own PDF-export renderer (lib/export/pdf.ts) — not for this
// config. Because the variable is read here too, CI ends up on the explicit
// branch below, pointed at the same binary `playwright install` just
// downloaded — same outcome as "resolve its own" would give, but not by
// that mechanism.
const provisionedChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = existsSync(provisionedChromium) ? provisionedChromium : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  // Reuse an already-running server locally; start one in CI.
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
