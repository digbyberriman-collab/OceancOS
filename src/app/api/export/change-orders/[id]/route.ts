import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { listProjectsForUser } from "@/lib/project";
import { appBaseUrl, renderPdf } from "@/lib/export/pdf";
import { exportFilename } from "@/lib/export/table";

export const dynamic = "force-dynamic";
// Launching a browser and printing a page takes longer than the default.
export const maxDuration = 60;

/**
 * A change order as PDF.
 *
 * Renders /print/change-orders/[id] in a headless browser, so the document is
 * the real page rather than a second layout that can drift from it. The
 * renderer carries the caller's own session, so it can never see more than the
 * caller would.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.CO_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.id },
    select: { id: true, number: true, projectId: true },
  });
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const projects = await listProjectsForUser(user.id);
  if (!projects.some((p) => p.id === co.projectId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sessionToken = cookies().get("oc_session")?.value;

  try {
    const pdf = await renderPdf({
      url: `${appBaseUrl(request)}/print/change-orders/${co.id}`,
      sessionToken,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${exportFilename(co.number, "pdf")}"`,
      },
    });
  } catch (err) {
    // A missing browser is a deployment problem, not a bad request. Say so
    // plainly rather than returning a stack trace from inside Playwright.
    const message = err instanceof Error ? err.message : "PDF rendering failed";
    return NextResponse.json(
      {
        error: "Could not render the PDF",
        detail: message,
        hint: "The server needs Chromium. Set PLAYWRIGHT_CHROMIUM_PATH or PDF_CHROME_CHANNEL.",
      },
      { status: 503 }
    );
  }
}
