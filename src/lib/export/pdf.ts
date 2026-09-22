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

import { existsSync } from "node:fs";
import type { Browser } from "playwright-core";
import { QueueFullError, Semaphore } from "@/lib/concurrency";

export type PdfOptions = {
  /** Absolute URL on this app that the renderer should print. */
  url: string;
  /** Session cookie, so the renderer sees exactly what the user would. */
  sessionToken?: string;
  landscape?: boolean;
  /** Header and footer are off by default; the page supplies its own. */
  printBackground?: boolean;
};

/** Thrown by `renderPdf` when the concurrency queue is already full. */
export class PdfBusyError extends Error {
  constructor() {
    super("The PDF renderer is handling too many requests right now.");
    this.name = "PdfBusyError";
  }
}

// Module state survives dev's hot-reload the same way the Prisma singleton
// does (src/lib/db.ts) — a global guard, not a plain module-scoped variable,
// so a re-import doesn't launch a second browser, register a second SIGTERM
// handler, or start a second, independent semaphore.
const globalForPdf = globalThis as unknown as {
  pdfBrowser?: Browser | null;
  pdfSemaphore?: Semaphore;
  pdfIdleTimer?: ReturnType<typeof setTimeout> | null;
  pdfShutdownRegistered?: boolean;
};

// Ten users clicking "download PDF" at once used to spawn ten renderer
// processes on top of the ~150 MB Chromium base — a plausible OOM on a small
// container (performance [PDF], High). Bounded to a few concurrent contexts;
// the rest queue briefly, and the queue itself is bounded so a burst fails
// fast rather than piling up.
const MAX_CONCURRENT_RENDERS = 3;
const MAX_QUEUE_DEPTH = 5;
// No PDF request in 5 minutes: release Chromium's memory rather than holding
// it resident for the life of the process.
const IDLE_CLOSE_MS = 5 * 60 * 1000;

function semaphore(): Semaphore {
  if (!globalForPdf.pdfSemaphore) {
    globalForPdf.pdfSemaphore = new Semaphore(MAX_CONCURRENT_RENDERS, MAX_QUEUE_DEPTH);
  }
  return globalForPdf.pdfSemaphore;
}

async function acquireSlot(): Promise<void> {
  try {
    await semaphore().acquire();
  } catch (err) {
    if (err instanceof QueueFullError) throw new PdfBusyError();
    throw err;
  }
}

function releaseSlot(): void {
  semaphore().release();
  if (semaphore().activeCount === 0) scheduleIdleClose();
}

function scheduleIdleClose(): void {
  if (globalForPdf.pdfIdleTimer) clearTimeout(globalForPdf.pdfIdleTimer);
  globalForPdf.pdfIdleTimer = setTimeout(() => {
    if (semaphore().activeCount === 0) void closePdfRenderer();
  }, IDLE_CLOSE_MS);
  // A timer alone would keep the process alive; this render queue is not
  // something worth blocking shutdown on.
  globalForPdf.pdfIdleTimer.unref?.();
}

function registerShutdownHandlers(): void {
  if (globalForPdf.pdfShutdownRegistered) return;
  globalForPdf.pdfShutdownRegistered = true;
  const onShutdown = () => {
    void closePdfRenderer();
  };
  process.on("SIGTERM", onShutdown);
  process.on("SIGINT", onShutdown);
}

/**
 * One browser per process, reused across requests. Launching Chromium takes
 * roughly a second, which would otherwise be paid on every download.
 */
async function browser(): Promise<Browser> {
  registerShutdownHandlers();
  if (globalForPdf.pdfBrowser?.isConnected()) return globalForPdf.pdfBrowser;

  const { chromium } = await import("playwright-core");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const channel = process.env.PDF_CHROME_CHANNEL;

  globalForPdf.pdfBrowser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    ...(channel ? { channel } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  return globalForPdf.pdfBrowser;
}

export async function renderPdf(options: PdfOptions): Promise<Buffer> {
  await acquireSlot();
  try {
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
  } finally {
    releaseSlot();
  }
}

/** Close the shared browser. Used by tests, the idle timer and on shutdown. */
export async function closePdfRenderer(): Promise<void> {
  if (globalForPdf.pdfIdleTimer) {
    clearTimeout(globalForPdf.pdfIdleTimer);
    globalForPdf.pdfIdleTimer = null;
  }
  if (globalForPdf.pdfBrowser?.isConnected()) await globalForPdf.pdfBrowser.close();
  globalForPdf.pdfBrowser = null;
}

/**
 * Whether PDF rendering can work in this environment.
 *
 * Probes for the executable a launch would use rather than actually
 * launching one — `pdfAvailable()` used to call `browser()` as its check,
 * which meant a capability check (a health check, say) permanently added a
 * resident Chromium process as a side effect (performance [PDF], High).
 */
export async function pdfAvailable(): Promise<boolean> {
  if (globalForPdf.pdfBrowser?.isConnected()) return true;

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (executablePath) return existsSync(executablePath);

  // A system channel's presence isn't cheaply verifiable without launching
  // it, so a configured channel is taken as available — it was set
  // deliberately, unlike the bundled-Chromium fallback below.
  if (process.env.PDF_CHROME_CHANNEL) return true;

  try {
    const { chromium } = await import("playwright-core");
    return existsSync(chromium.executablePath());
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
