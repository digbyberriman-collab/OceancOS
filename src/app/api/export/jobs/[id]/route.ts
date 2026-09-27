import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { appBaseUrl, PdfBusyError, renderPdf } from "@/lib/export/pdf";
import { exportFilename } from "@/lib/export/table";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A quote as PDF, printed from the real quote page. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.JOB_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    select: { id: true, code: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const pdf = await renderPdf({
      url: `${appBaseUrl(request)}/print/jobs/${job.id}`,
      sessionToken: cookies().get("oc_session")?.value,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${exportFilename(job.code, "pdf")}"`,
      },
    });
  } catch (err) {
    if (err instanceof PdfBusyError) {
      return NextResponse.json(
        { error: "The PDF renderer is busy", detail: err.message, hint: "Try again in a few seconds." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: "Could not render the PDF",
        detail: err instanceof Error ? err.message : "unknown",
        hint: "The server needs Chromium. Set PLAYWRIGHT_CHROMIUM_PATH or PDF_CHROME_CHANNEL.",
      },
      { status: 503 }
    );
  }
}
