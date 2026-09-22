import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { accessibleProjectIds } from "@/lib/project";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DEPARTMENTS, PRIORITIES } from "@/lib/enums";
import { toNumber } from "@/lib/utils";
import { updateChangeOrder } from "../../actions";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditChangeOrderPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CO_EDIT)) {
    return <EmptyState title="Forbidden" hint="You cannot edit change orders." />;
  }

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.id },
    include: { project: { select: { vesselId: true } } },
  });
  if (!co) return notFound();

  const projectIds = await accessibleProjectIds(user.id);
  if (!projectIds.includes(co.projectId)) return notFound();

  if (co.status !== "DRAFT" && co.status !== "MORE_INFO") {
    return (
      <EmptyState
        title="Cannot be edited"
        hint={`${co.number} is ${co.status.replace(/_/g, " ").toLowerCase()}, so it can no longer be amended here.`}
        action={
          <Link href={`/change-orders/${co.id}`} className="btn">
            Back to the change order
          </Link>
        }
      />
    );
  }

  const areas = await prisma.vesselArea.findMany({ where: { vesselId: co.project.vesselId } });

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <Link
          href={`/change-orders/${co.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          {co.number} — {co.title}
        </Link>
        <PageHeader
          title="Revise change order"
          eyebrow={co.number}
          subtitle="Changes are recorded on the change order's history."
        />
      </div>

      <form action={updateChangeOrder} className="max-w-2xl space-y-0">
        <input type="hidden" name="id" value={co.id} />
        {/* Core change details */}
        <div className="surface p-6 rounded-b-none border-b-0 space-y-5">
          <div className="eyebrow mb-1">Change Details</div>
          <Field label="Title">
            <Input
              name="title"
              required
              minLength={3}
              maxLength={200}
              defaultValue={co.title}
              placeholder="Short descriptive title…"
            />
          </Field>
          <Field label="Description">
            <Textarea
              name="description"
              required
              minLength={5}
              defaultValue={co.description}
              placeholder="What is changing and why?"
            />
          </Field>
          <Field label="Reason for Change">
            <Textarea
              name="reason"
              required
              minLength={3}
              defaultValue={co.reason}
              placeholder="Underlying cause or driver…"
            />
          </Field>
        </div>

        {/* Classification */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Classification</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Department">
              <Select name="departmentCode" defaultValue={co.departmentCode ?? ""}>
                <option value="">— No department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vessel Area">
              <Select name="vesselAreaId" defaultValue={co.vesselAreaId ?? ""}>
                <option value="">— No area</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue={co.priority}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {/* Cost & schedule */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Cost &amp; Schedule</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Estimated Cost (EUR)">
              <Input
                type="number"
                name="estimatedCost"
                min={0}
                step="0.01"
                defaultValue={toNumber(co.estimatedCost)}
              />
            </Field>
            <Field label="Schedule Impact (days)">
              <Input type="number" name="scheduleImpactDays" defaultValue={co.scheduleImpactDays} />
            </Field>
          </div>
        </div>

        {/* Impact assessments */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Impact Assessment</div>
          <Field label="Risk Impact">
            <Textarea
              name="riskImpact"
              defaultValue={co.riskImpact ?? ""}
              placeholder="What risks does this introduce or mitigate?"
            />
          </Field>
          <Field label="Technical Impact">
            <Textarea
              name="technicalImpact"
              defaultValue={co.technicalImpact ?? ""}
              placeholder="Affected systems, drawings, vendors…"
            />
          </Field>
        </div>

        {/* Regulatory */}
        <div className="surface p-6 rounded-t-none border-t-0 space-y-4">
          <div className="eyebrow mb-1">Regulatory</div>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm cursor-pointer group">
              <input
                type="checkbox"
                name="needsClassReview"
                value="true"
                defaultChecked={co.needsClassReview}
                className="h-4 w-4 rounded border-line bg-ink-950 accent-accent"
              />
              <span className="text-muted group-hover:text-white transition-colors">
                Requires class review
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm cursor-pointer group">
              <input
                type="checkbox"
                name="needsFlagReview"
                value="true"
                defaultChecked={co.needsFlagReview}
                className="h-4 w-4 rounded border-line bg-ink-950 accent-accent"
              />
              <span className="text-muted group-hover:text-white transition-colors">
                Requires flag review
              </span>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-between gap-4 border-t border-line mt-2">
            <p className="text-xs text-muted">
              Still <span className="font-medium text-white">{co.status.replace(/_/g, " ").toLowerCase()}</span> until submitted.
            </p>
            <SubmitButton className="btn-primary btn-lg" pendingText="Saving…">
              Save changes
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}
