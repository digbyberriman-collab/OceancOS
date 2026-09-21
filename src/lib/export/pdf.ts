// PDF export.
//
// Decided in BRIDGE_ALIGNMENT_PLAN.md §7 item 5: the PDF is the real page
// printed, not a second layout. A quote or invoice therefore cannot drift
// between what the client sees on screen and what they file, and there is only
// one template to maintain.
//
// The trade-off is that the production image needs Chromium. Set
// PLAYWRIGHT_CHROMIUM_PATH to the binary, or install a system Chrome and set
// PDF_CHROME_CHANNEL (for example "chrome").

import type { Browser } from "playwright-core";

export type PdfOptions = {
  /** Absolute URL on this app that the renderer should print. */
  url: string;
  /** Session cookie, so the renderer sees exactly what the user would. */
  sessionToken?: string;
  landscape?: boolean;
  /** Header and footer are off by default; the page supplies its own. */
  printBackground?: boolean;
};

let cached: Browser | null = null;

/**
 * One browser per process, reused across requests. Launching Chromium takes
 * roughly a second, which would otherwise be paid on every download.
 */
async function browser(): Promise<Browser> {
  if (cached?.isConnected()) return cached;

  const { chromium } = await import("playwright-core");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const channel = process.env.PDF_CHROME_CHANNEL;

  cached = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    ...(channel ? { channel } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  return cached;
}

export async function renderPdf(options: PdfOptions): Promise<Buffer> {
  const instance = await browser();
  const context = await instance.newContext({ viewport: { width: 1240, height: 1754 } });

  try {
    if (options.sessionToken) {
      const url = new URL(options.url);
      await context.addCookies([
        {
          name: "oc_session",
          value: options.sessionToken,
          domain: url.hostname,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }

    const page = await context.newPage();
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: 30_000 });

    if (!response || response.status() >= 400) {
      throw new Error(`Print view returned ${response?.status() ?? "no response"}`);
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: options.printBackground ?? true,
      landscape: options.landscape ?? false,
      margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });

    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** Close the shared browser. Used by tests and on shutdown. */
export async function closePdfRenderer(): Promise<void> {
  if (cached?.isConnected()) await cached.close();
  cached = null;
}

/**
 * Whether PDF rendering can work in this environment.
 *
 * Checked before a request tries to launch, so the caller can return a clear
 * "not configured" rather than a stack trace from deep inside Playwright.
 */
export async function pdfAvailable(): Promise<boolean> {
  try {
    await browser();
    return true;
  } catch {
    return false;
  }
}

/** The app's own base URL, which the renderer navigates back to. */
export function appBaseUrl(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
