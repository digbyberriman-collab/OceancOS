import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { listProjectsForUser } from "@/lib/project";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";
import { resolveUserNames } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Print view of a change order.
 *
 * This is the page the PDF is made from, so there is no second template to
 * drift. It is deliberately ink-on-paper rather than the app's dark theme:
 * a dark page wastes toner and reads badly when filed or posted.
 */
export default async function ChangeOrderPrint({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CO_VIEW)) return notFound();

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.id },
    include: {
      project: { include: { vessel: true } },
      approvals: { orderBy: { order: "asc" } },
    },
  });
  if (!co) return notFound();

  const projects = await listProjectsForUser(user.id);
  if (!projects.some((p) => p.id === co.projectId)) return notFound();

  const names = await resolveUserNames([
    ...co.approvals.map((a) => a.decidedById),
    co.createdById,
  ]);

  const canSeeMoney = hasPermission(user, PERMISSIONS.FIN_VIEW);

  return (
    <main className="print-sheet">
      <style
        // Scoped to this route: the app's dark theme does not apply to paper.
        dangerouslySetInnerHTML={{
          __html: `
            .print-sheet { background:#fff; color:#111827; font-family:var(--font-sans); padding:0; }
            .print-sheet h1 { font-size:20px; font-weight:600; margin:0; }
            .print-sheet h2 { font-size:12px; font-weight:600; text-transform:uppercase;
              letter-spacing:.08em; color:#6b7280; margin:22px 0 8px; }
            .print-sheet table { width:100%; border-collapse:collapse; font-size:12px; }
            .print-sheet th, .print-sheet td { text-align:left; padding:7px 8px;
              border-bottom:1px solid #e5e7eb; vertical-align:top; }
            .print-sheet th { color:#6b7280; font-weight:600; }
            .print-sheet .num { text-align:right; font-variant-numeric:tabular-nums; }
            .print-sheet .muted { color:#6b7280; }
            .print-sheet .rule { border-bottom:2px solid #111827; padding-bottom:10px; }
            @page { size:A4; }
          `,
        }}
      />

      <header className="rule flex items-start justify-between gap-6">
        <div>
          <h1>
            {co.number} — {co.title}
          </h1>
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
            {co.project.vessel.name} · {co.project.name}
            {co.project.code ? ` · ${co.project.code}` : ""}
          </p>
        </div>
        <div style={{ textAlign: "right", fontSize: 11 }} className="muted">
          <div style={{ fontWeight: 600, color: "#111827" }}>OceancOS</div>
          <div>Change order</div>
          <div>{fmtDate(new Date())}</div>
        </div>
      </header>

      <h2>Details</h2>
      <table>
        <tbody>
          <Row label="Status" value={co.status.replace(/_/g, " ")} />
          <Row label="Priority" value={co.priority} />
          <Row label="Department" value={co.departmentCode ?? "—"} />
          <Row label="Raised by" value={names.get(co.createdById) ?? "—"} />
          <Row label="Raised on" value={fmtDateTime(co.createdAt)} />
          {canSeeMoney && <Row label="Estimated cost" value={fmtMoney(co.estimatedCost, co.project.currency)} />}
          {canSeeMoney && <Row label="Approved cost" value={fmtMoney(co.approvedCost, co.project.currency)} />}
          <Row
            label="Schedule impact"
            value={co.scheduleImpactDays ? `${co.scheduleImpactDays} days` : "None"}
          />
          <Row label="Class review" value={co.needsClassReview ? "Required" : "Not required"} />
          <Row label="Flag review" value={co.needsFlagReview ? "Required" : "Not required"} />
        </tbody>
      </table>

      <h2>Description</h2>
      <p style={{ fontSize: 12, whiteSpace: "pre-wrap", margin: 0 }}>{co.description}</p>

      <h2>Reason for change</h2>
      <p style={{ fontSize: 12, whiteSpace: "pre-wrap", margin: 0 }}>{co.reason}</p>

      {(co.riskImpact || co.technicalImpact) && (
        <>
          <h2>Impact assessment</h2>
          {co.riskImpact && (
            <p style={{ fontSize: 12, margin: "0 0 8px" }}>
              <strong>Risk:</strong> {co.riskImpact}
            </p>
          )}
          {co.technicalImpact && (
            <p style={{ fontSize: 12, margin: 0 }}>
              <strong>Technical:</strong> {co.technicalImpact}
            </p>
          )}
        </>
      )}

      <h2>Approval chain</h2>
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Decision</th>
            <th>Decided by</th>
            <th>Decided on</th>
          </tr>
        </thead>
        <tbody>
          {co.approvals.map((a) => (
            <tr key={a.id}>
              <td>{a.stage.replace(/_/g, " ")}</td>
              <td>{a.decision}</td>
              <td>{a.decidedById ? (names.get(a.decidedById) ?? "—") : "—"}</td>
              <td>{a.decidedAt ? fmtDate(a.decidedAt) : "—"}</td>
            </tr>
          ))}
          {co.approvals.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No approval stages configured.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="muted" style={{ fontSize: 10, marginTop: 28 }}>
        Generated from OceancOS on {fmtDateTime(new Date())}. This document reflects the record at the
        time of printing.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th style={{ width: "34%" }}>{label}</th>
      <td>{value}</td>
    </tr>
  );
}
