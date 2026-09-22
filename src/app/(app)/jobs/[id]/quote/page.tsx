import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { listProjectsForUser } from "@/lib/project";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CONTRACT_TYPES, CONTRACT_TYPE_LABELS, PRICING_BASES, PRICING_BASIS_LABELS } from "@/lib/enums";
import { DEFAULT_JOB_CODE_PATTERN } from "@/lib/jobs/codes";
import { issueQuote } from "../../actions";

export const dynamic = "force-dynamic";

/** Blank line rows. The yard fills what it needs and leaves the rest empty. */
const LINE_ROWS = 6;

export default async function QuoteJob({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { err?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.JOB_ISSUE_QUOTE)) {
    return <EmptyState title="Forbidden" hint="Only the yard prices requests." />;
  }

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: { project: true, section: true },
  });
  if (!job) return notFound();

  const projects = await listProjectsForUser(user.id);
  if (!projects.some((p) => p.id === job.projectId)) return notFound();

  if (job.status !== "NEW_REQUEST") {
    return (
      <EmptyState
        title="Already priced"
        hint={`${job.code} is no longer a new request, so it cannot be quoted again here.`}
        action={
          <Link href={`/jobs/${job.id}`} className="btn">
            Back to the job
          </Link>
        }
      />
    );
  }

  return (
    <div className="animate-fade-up">
      <Link
        href={`/jobs/${job.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
      >
        <ArrowLeft size={13} />
        {job.code} — {job.title}
      </Link>

      <PageHeader
        eyebrow="Yard"
        title="Issue quote"
        subtitle="Set the job code, price the work, and state what is excluded."
      />

      {searchParams.err && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{searchParams.err}</span>
        </div>
      )}

      <form action={issueQuote} className="max-w-4xl space-y-4">
        <input type="hidden" name="jobId" value={job.id} />

        <SectionCard title="The request">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{job.description}</p>
        </SectionCard>

        <SectionCard title="Classification">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Job code"
              hint="The yard's code, for example D.0130.05."
            >
              <Input
                name="code"
                required
                defaultValue={job.code}
                pattern={DEFAULT_JOB_CODE_PATTERN.replace(/^\^|\$$/g, "")}
                placeholder="D.0130.05"
                className="tnum"
              />
            </Field>
            <Field label="Contract type">
              <Select name="contractType" defaultValue={job.contractType}>
                {CONTRACT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CONTRACT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pricing basis">
              <Select name="pricingBasis" defaultValue={job.pricingBasis}>
                {PRICING_BASES.map((basis) => (
                  <option key={basis} value={basis}>
                    {PRICING_BASIS_LABELS[basis]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Valid for (days)" hint="Blank means no expiry.">
              <Input type="number" name="validityDays" min={1} max={365} defaultValue={30} />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="exceptionFlag" className="h-4 w-4 rounded border-line" />
            Flag as an exception
          </label>
        </SectionCard>

        <SectionCard title="Lines">
          <div className="-mx-2 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-1/2">Description</th>
                  <th className="text-right">Quantity</th>
                  <th>Unit</th>
                  <th className="text-right">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: LINE_ROWS }, (_, i) => (
                  <tr key={i}>
                    <td>
                      <Input
                        name="lineDescription"
                        placeholder={i === 0 ? "Skilled worker — mechanic, pipe fitter" : ""}
                        aria-label={`Line ${i + 1} description`}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        name="lineQuantity"
                        defaultValue={i === 0 ? 1 : ""}
                        className="text-right tnum"
                        aria-label={`Line ${i + 1} quantity`}
                      />
                    </td>
                    <td>
                      <Input
                        name="lineUnit"
                        defaultValue="UN"
                        className="w-20"
                        aria-label={`Line ${i + 1} unit`}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.01"
                        name="lineUnitPrice"
                        defaultValue={i === 0 ? 0 : ""}
                        className="text-right tnum"
                        aria-label={`Line ${i + 1} unit price`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-faint">
            Empty lines are ignored. The total is calculated from quantity × unit price and held with
            the quote, so an accepted figure never changes afterwards.
          </p>
        </SectionCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Exclusions">
            <Field label="One per line" hint="What this price does not cover.">
              <Textarea
                name="exclusions"
                rows={6}
                placeholder={"Removal and refitting of existing covers.\nAny repair found beyond the stated scope."}
              />
            </Field>
          </SectionCard>
          <SectionCard title="Notes">
            <Field label="One per line" hint="Conditions the client should read before accepting.">
              <Textarea
                name="notes"
                rows={6}
                placeholder={"Quantities are estimated; final quantity invoiced on the weighbridge ticket."}
              />
            </Field>
          </SectionCard>
        </div>

        <div className="flex items-center gap-3">
          <SubmitButton className="btn-primary btn-lg" pendingText="Sending…">Send quote</SubmitButton>
          <Link href={`/jobs/${job.id}`} className="btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
