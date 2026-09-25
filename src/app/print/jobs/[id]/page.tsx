import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { listProjectsForUser } from "@/lib/project";
import { fmtDate, fmtDateTime, fmtMoney, toNumber } from "@/lib/utils";
import { isExpired } from "@/lib/jobs/workflow";
import {
  CONTRACT_TYPE_LABELS,
  JOB_STATUS_LABELS,
  PRICING_BASIS_LABELS,
  type ContractType,
  type JobStatus,
  type PricingBasis,
} from "@/lib/enums";

export const dynamic = "force-dynamic";

type InvoicingTerm = { pct?: number; trigger?: string; date?: string };

/**
 * Print view of a quote — the page the PDF is made from.
 *
 * Ink on paper, and laid out the way a quotation reads: description, lines and
 * total, exclusions, notes, variation detail, then the signatures.
 */
export default async function JobPrint({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.JOB_VIEW)) return notFound();

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: {
      project: { include: { vessel: true } },
      section: true,
      lines: { orderBy: { sort: "asc" } },
      notes: { orderBy: [{ kind: "asc" }, { sort: "asc" }] },
      variation: true,
    },
  });
  if (!job) return notFound();

  const projects = await listProjectsForUser(user.id);
  if (!projects.some((p) => p.id === job.projectId)) return notFound();

  const people = await prisma.user.findMany({
    where: {
      id: {
        in: [job.clientAcceptedById, job.yardAcceptedById].filter((x): x is string => !!x),
      },
    },
    select: { id: true, name: true },
  });
  const nameOf = (id: string | null) => (id && people.find((p) => p.id === id)?.name) || "—";

  const currency = job.currency || job.project.currency;
  const exclusions = job.notes.filter((n) => n.kind === "EXCLUSION");
  const notes = job.notes.filter((n) => n.kind === "NOTE");
  const terms = Array.isArray(job.variation?.invoicingTerms)
    ? (job.variation?.invoicingTerms as InvoicingTerm[])
    : [];

  return (
    <main className="print-sheet">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .print-sheet { background:#fff; color:#111827; font-family:var(--font-sans); }
            .print-sheet h1 { font-size:19px; font-weight:600; margin:0; }
            .print-sheet h2 { font-size:11px; font-weight:600; text-transform:uppercase;
              letter-spacing:.08em; color:#6b7280; margin:20px 0 7px; }
            .print-sheet table { width:100%; border-collapse:collapse; font-size:11.5px; }
            .print-sheet th, .print-sheet td { text-align:left; padding:6px 8px;
              border-bottom:1px solid #e5e7eb; vertical-align:top; }
            .print-sheet th { color:#6b7280; font-weight:600; }
            .print-sheet .num { text-align:right; font-variant-numeric:tabular-nums; }
            .print-sheet .muted { color:#6b7280; }
            .print-sheet .rule { border-bottom:2px solid #111827; padding-bottom:9px; }
            .print-sheet ol { margin:0; padding-left:18px; font-size:11.5px; }
            .print-sheet li { margin-bottom:3px; }
            .print-sheet .sig { border:1px solid #d1d5db; border-radius:6px; padding:9px 11px; }
            @page { size:A4; }
          `,
        }}
      />

      <header className="rule" style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
        <div>
          <h1>
            {job.code} — {job.title}
          </h1>
          <p className="muted" style={{ fontSize: 11.5, margin: "5px 0 0" }}>
            {job.project.vessel.name} · {job.project.name}
            {job.project.code ? ` · ${job.project.code}` : ""}
            {job.section ? ` · ${job.section.name}` : ""}
          </p>
        </div>
        <div className="muted" style={{ textAlign: "right", fontSize: 10.5 }}>
          <div style={{ fontWeight: 600, color: "#111827" }}>
            {job.project.yardName ?? "OceancOS"}
          </div>
          <div>{CONTRACT_TYPE_LABELS[job.contractType as ContractType] ?? job.contractType}</div>
          <div>{JOB_STATUS_LABELS[job.status as JobStatus] ?? job.status}</div>
          <div>{fmtDate(new Date())}</div>
        </div>
      </header>

      <h2>Job &amp; service description</h2>
      <p style={{ fontSize: 11.5, whiteSpace: "pre-wrap", margin: 0 }}>{job.description}</p>

      {job.lines.length > 0 && (
        <>
          <h2>Pricing</h2>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Quantity</th>
                <th>Unit</th>
                <th className="num">Unit price</th>
                <th className="num">Total price</th>
              </tr>
            </thead>
            <tbody>
              {job.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td className="num">{toNumber(line.quantity).toLocaleString("en-GB")}</td>
                  <td>{line.unit}</td>
                  <td className="num">{fmtMoney(line.unitPrice, currency)}</td>
                  <td className="num">{fmtMoney(line.total, currency)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="num" style={{ fontWeight: 600 }}>
                  Total {PRICING_BASIS_LABELS[job.pricingBasis as PricingBasis] ?? ""}
                </td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {fmtMoney(job.total, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {exclusions.length > 0 && (
        <>
          <h2>Exclusions</h2>
          <ol>
            {exclusions.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ol>
        </>
      )}

      {notes.length > 0 && (
        <>
          <h2>Notes</h2>
          <ol>
            {notes.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ol>
        </>
      )}

      {job.variation && (
        <>
          <h2>Variation certificate details</h2>
          <table>
            <tbody>
              <tr>
                <th style={{ width: "34%" }}>Variation due to</th>
                <td>{job.variation.dueTo?.replace(/_/g, " ").toLowerCase() ?? "—"}</td>
              </tr>
              <tr>
                <th>Variation affecting</th>
                <td>{job.variation.affecting?.replace(/_/g, " ").toLowerCase() ?? "—"}</td>
              </tr>
              <tr>
                <th>Adjustment to delivery date</th>
                <td>{job.variation.deliveryAdjustment ?? "—"}</td>
              </tr>
              <tr>
                <th>Adjustment to contract price</th>
                <td className="num">
                  {job.variation.priceAdjustment == null
                    ? "—"
                    : fmtMoney(job.variation.priceAdjustment, currency)}
                </td>
              </tr>
              <tr>
                <th>Adjustment to invoicing terms</th>
                <td>
                  {terms.length === 0
                    ? "—"
                    : terms
                        .map((t) => `${t.pct}% on ${String(t.trigger ?? "").toLowerCase()}`)
                        .join(" · ")}
                </td>
              </tr>
              <tr>
                <th>Variation certificate valid for</th>
                <td>
                  {job.validityDays ? `${job.validityDays} days` : "—"}
                  {isExpired(job) ? " (expired)" : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <h2>Acceptance</h2>
      <div style={{ display: "flex", gap: 12 }}>
        <div className="sig" style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 11.5 }}>
            {job.clientAcceptedAt ? "Digitally accepted" : "Client acceptance"}
          </div>
          <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
            <div>Type: Quote accepted</div>
            <div>Name: {nameOf(job.clientAcceptedById)}</div>
            <div>Date: {job.clientAcceptedAt ? fmtDateTime(job.clientAcceptedAt) : "—"}</div>
          </div>
        </div>
        <div className="sig" style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 11.5 }}>
            {job.yardAcceptedAt ? "Digitally accepted" : "Yard countersignature"}
          </div>
          <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
            <div>Type: Yard accepted</div>
            <div>Name: {nameOf(job.yardAcceptedById)}</div>
            <div>Date: {job.yardAcceptedAt ? fmtDateTime(job.yardAcceptedAt) : "—"}</div>
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 9.5, marginTop: 24 }}>
        Generated from OceancOS on {fmtDateTime(new Date())}. This document reflects the record at the
        time of printing.
      </p>
    </main>
  );
}
