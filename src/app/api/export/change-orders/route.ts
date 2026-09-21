import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { getActiveProject, projectScope } from "@/lib/project";
import { buildWorkbook } from "@/lib/export/xlsx";
import { exportFilename, toCsv, type Sheet } from "@/lib/export/table";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof loadRows>>[number];

/**
 * Pinned to one project when the caller has one active; otherwise every
 * project they can reach — never every project in the database. The old
 * `projectId ? { projectId } : undefined` fell to "no filter at all" for a
 * user with no active project, which for a user who could reach *no*
 * project meant exporting everyone else's change orders too. See
 * AUDIT_REPORT.md §6 and `projectScope`'s own docstring.
 */
async function loadRows(userId: string, projectId?: string) {
  return prisma.changeOrder.findMany({
    where: { archivedAt: null, ...(projectId ? { projectId } : await projectScope(userId)) },
    include: { project: { include: { vessel: true } } },
    orderBy: { number: "asc" },
  });
}

/**
 * The change-order list as a spreadsheet, the way The Bridge offers one beside
 * every list. Costs are omitted for a user without financial access, so an
 * export can never become a way around the permission model.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.CO_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const project = await getActiveProject(user.id);
  const rows = await loadRows(user.id, project?.id);
  const showMoney = hasPermission(user, PERMISSIONS.FIN_VIEW);

  const sheet: Sheet<Row> = {
    name: project ? `${project.code ?? project.name}` : "Change orders",
    rows,
    totals: showMoney ? ["Estimated cost", "Approved cost"] : [],
    columns: [
      { header: "Number", type: "text", value: (r) => r.number, width: 12 },
      { header: "Title", type: "text", value: (r) => r.title, width: 44 },
      { header: "Vessel", type: "text", value: (r) => r.project.vessel.name, width: 22 },
      { header: "Status", type: "text", value: (r) => r.status.replace(/_/g, " "), width: 18 },
      { header: "Priority", type: "text", value: (r) => r.priority, width: 12 },
      { header: "Department", type: "text", value: (r) => r.departmentCode ?? "", width: 16 },
      ...(showMoney
        ? ([
            { header: "Estimated cost", type: "money", value: (r: Row) => r.estimatedCost, width: 16 },
            { header: "Approved cost", type: "money", value: (r: Row) => r.approvedCost ?? null, width: 16 },
          ] as const)
        : []),
      { header: "Schedule impact (days)", type: "number", value: (r) => r.scheduleImpactDays, width: 20 },
      { header: "Raised", type: "date", value: (r) => r.createdAt, width: 14 },
    ],
  };

  const base = project?.code ? `change-orders-${project.code}` : "change-orders";

  if (format === "csv") {
    return new NextResponse(toCsv(sheet), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(base, "csv")}"`,
      },
    });
  }

  const workbook = await buildWorkbook([sheet], { title: "OceancOS change orders" });
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename(base, "xlsx")}"`,
    },
  });
}
