import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { DEPARTMENTS, PRIORITIES } from "@/lib/enums";
import { createChangeOrder } from "../actions";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewChangeOrderPage() {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CO_CREATE);
  const projects = await prisma.project.findMany({ where: { archivedAt: null }, include: { vessel: true } });
  const areas = await prisma.vesselArea.findMany();

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <Link
          href="/change-orders"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          Change Orders
        </Link>
        <PageHeader
          title="New Change Order"
          eyebrow="Change Orders"
          subtitle="Capture scope, cost, schedule and risk impact."
        />
      </div>

      <form action={createChangeOrder} className="max-w-2xl space-y-0">
        {/* Project */}
        <div className="surface p-6 rounded-b-none border-b-0 space-y-5">
          <div className="eyebrow mb-1">Project</div>
          <Field label="Project">
            <Select name="projectId" required>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.vessel.name} — {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Core change details */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Change Details</div>
          <Field label="Title">
            <Input
              name="title"
              required
              minLength={3}
              maxLength={200}
              placeholder="Short descriptive title…"
            />
          </Field>
          <Field label="Description">
            <Textarea
              name="description"
              required
              placeholder="What is changing and why?"
            />
          </Field>
          <Field label="Reason for Change">
            <Textarea
              name="reason"
              required
              placeholder="Underlying cause or driver…"
            />
          </Field>
        </div>

        {/* Classification */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Classification</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Department">
              <Select name="departmentCode" defaultValue="">
                <option value="">— No department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vessel Area">
              <Select name="vesselAreaId" defaultValue="">
                <option value="">— No area</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="MEDIUM">
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
              <Input type="number" name="estimatedCost" min={0} step="0.01" defaultValue={0} />
            </Field>
            <Field label="Schedule Impact (days)">
              <Input type="number" name="scheduleImpactDays" defaultValue={0} />
            </Field>
          </div>
        </div>

        {/* Impact assessments */}
        <div className="surface p-6 rounded-none border-t-0 border-b-0 space-y-5">
          <div className="eyebrow mb-1">Impact Assessment</div>
          <Field label="Risk Impact">
            <Textarea
              name="riskImpact"
              placeholder="What risks does this introduce or mitigate?"
            />
          </Field>
          <Field label="Technical Impact">
            <Textarea
              name="technicalImpact"
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
                className="h-4 w-4 rounded border-line bg-ink-950 accent-accent"
              />
              <span className="text-muted group-hover:text-white transition-colors">
                Requires flag review
              </span>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-between gap-4 border-t border-line mt-5">
            <p className="text-xs text-muted">
              The change order will be saved as a{" "}
              <span className="font-medium text-white">Draft</span> until submitted for review.
            </p>
            <button className="btn-primary btn-lg" type="submit">
              Create Draft
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
