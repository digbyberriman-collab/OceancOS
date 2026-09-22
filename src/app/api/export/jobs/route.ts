import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { getActiveProject } from "@/lib/project";
import { buildWorkbook } from "@/lib/export/xlsx";
import { exportFilename, toCsv, type Sheet } from "@/lib/export/table";
import { toNumber } from "@/lib/utils";
import { compareJobCodes } from "@/lib/jobs/codes";
import { CONTRACT_TYPE_LABELS, JOB_STATUS_LABELS, PRICING_BASIS_LABELS } from "@/lib/enums";
import type { ContractType, JobStatus, PricingBasis } from "@/lib/enums";

export const dynamic = "force-dynamic";

/**
 * The worklist as a spreadsheet: every quotation input and its status, which is
 * what The Bridge's Print All and Spreadsheet buttons produce.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.JOB_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await getActiveProject(user.id);
  if (!project) return NextResponse.json({ error: "No active project" }, { status: 404 });

  const rows = (
    await prisma.job.findMany({
      where: { projectId: project.id, archivedAt: null },
      include: { section: true },
    })
  ).sort((a, b) => compareJobCodes(a.code, b.code));

  const showMoney = hasPermission(user, PERMISSIONS.FIN_VIEW);
  type Row = (typeof rows)[number];

  const sheet: Sheet<Row> = {
    name: project.code ?? "Worklist",
    rows,
    totals: showMoney ? ["Total"] : [],
    columns: [
      { header: "Job no", type: "text", value: (r) => r.code, width: 14 },
      { header: "Your ref", type: "text", value: (r) => r.clientRef ?? "", width: 14 },
      { header: "Section", type: "text", value: (r) => r.section?.name ?? "", width: 20 },
      { header: "Title", type: "text", value: (r) => r.title, width: 46 },
      {
        header: "Status",
        type: "text",
        value: (r) => JOB_STATUS_LABELS[r.status as JobStatus] ?? r.status,
        width: 18,
      },
      { header: "Progress", type: "percent", value: (r) => r.progressPct / 100, width: 11 },
      { header: "Requested", type: "date", value: (r) => r.requestedAt, width: 13 },
      { header: "Quote delivered", type: "date", value: (r) => r.quoteDeliveredAt, width: 15 },
      { header: "Accepted", type: "date", value: (r) => r.clientAcceptedAt, width: 13 },
      { header: "Cancelled", type: "date", value: (r) => r.cancelledAt, width: 13 },
      ...(showMoney
        ? ([{ header: "Total", type: "money", value: (r: Row) => toNumber(r.total), width: 14 }] as const)
        : []),
      {
        header: "Contract",
        type: "text",
        value: (r) => CONTRACT_TYPE_LABELS[r.contractType as ContractType] ?? r.contractType,
        width: 20,
      },
      {
        header: "Type",
        type: "text",
        value: (r) =>
          `${PRICING_BASIS_LABELS[r.pricingBasis as PricingBasis] ?? r.pricingBasis}${
            r.exceptionFlag ? " (exception)" : ""
          }`,
        width: 18,
      },
    ],
  };

  const base = `worklist-${project.code ?? project.name}`;

  if (new URL(request.url).searchParams.get("format") === "csv") {
    return new NextResponse(toCsv(sheet), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(base, "csv")}"`,
      },
    });
  }

  const workbook = await buildWorkbook([sheet], { title: `${project.name} worklist` });
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename(base, "xlsx")}"`,
    },
  });
}
