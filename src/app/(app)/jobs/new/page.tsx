import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { getActiveProject } from "@/lib/project";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FileDrop } from "@/components/ui/FileDrop";
import { createJobRequest, type JobRequestFlash } from "../actions";
import { readFormFlash } from "@/lib/formFlash";
import { FlashCleanup } from "@/components/ui/FlashCleanup";

export const dynamic = "force-dynamic";

export default async function NewJobRequest() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.JOB_REQUEST)) {
    return <EmptyState title="Forbidden" hint="You cannot raise quote requests." />;
  }

  const project = await getActiveProject(user.id);
  if (!project) return <EmptyState title="No project" hint="You have no project assigned." />;

  const flash = readFormFlash<JobRequestFlash>("jobRequest");

  const [sections, authorisers, openChangeOrders] = await Promise.all([
    prisma.jobSection.findMany({ where: { projectId: project.id }, orderBy: { sort: "asc" } }),
    // Only people who can actually sign appear in the list, so a quote is never
    // addressed to someone without the authority to accept it.
    prisma.user.findMany({
      where: {
        active: true,
        roles: {
          some: {
            role: { permissions: { some: { permission: { key: PERMISSIONS.JOB_ACCEPT } } } },
          },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.changeOrder.findMany({
      where: {
        projectId: project.id,
        status: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
      },
      select: { id: true, number: true, title: true },
      orderBy: { number: "asc" },
      take: 200,
    }),
  ]);

  return (
    <div className="animate-fade-up">
      <Link
        href="/jobs"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
      >
        <ArrowLeft size={13} />
        Quotes &amp; requests
      </Link>

      <PageHeader
        eyebrow={project.code ?? undefined}
        title="New quote request"
        subtitle="Describe the work you want the yard to price."
      />

      {flash && (
        <>
          <FlashCleanup name="jobRequest" />
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{flash.error}</span>
          </div>
        </>
      )}

      <div className="max-w-3xl">
        <SectionCard title="Request">
          <form action={createJobRequest} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Your job reference"
                hint="Optional. Your own tracking number, if you use one."
              >
                <Input name="clientRef" maxLength={64} placeholder="MY-2026-031" defaultValue={flash?.values.clientRef ?? ""} />
              </Field>
              <Field label="Section" hint="Where the work belongs in the yard's code system.">
                <Select name="sectionId" defaultValue={flash?.values.sectionId ?? ""}>
                  <option value="">Not sure — let the yard decide</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.letter} · {section.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Job title">
              <Input
                name="title"
                required
                minLength={3}
                maxLength={200}
                placeholder="A short, descriptive title"
                defaultValue={flash?.values.title ?? ""}
              />
            </Field>

            <Field
              label="Job description"
              hint="The yard prices from this, so include as much detail as you can: location, quantities, access, and anything already known about the condition."
            >
              <Textarea
                name="description"
                required
                minLength={10}
                rows={7}
                placeholder="Describe the work in detail…"
                defaultValue={flash?.values.description ?? ""}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Designated authoriser"
                hint="Who may accept the quote. Ask the project manager if a name is missing."
              >
                <Select name="designatedAuthoriserId" required defaultValue={flash?.values.designatedAuthoriserId ?? ""}>
                  <option value="" disabled>
                    Choose a person
                  </option>
                  {authorisers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Authorised by change order"
                hint="Optional. Links this work to the internal approval that authorised it."
              >
                <Select name="linkedChangeOrderId" defaultValue={flash?.values.linkedChangeOrderId ?? ""}>
                  <option value="">None</option>
                  {openChangeOrders.map((co) => (
                    <option key={co.id} value={co.id}>
                      {co.number} — {co.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              as="fieldset"
              label="Attachments"
              hint="Photos, drawings or documents that help the yard understand the work."
            >
              <FileDrop
                projectId={project.id}
                resource="Job"
                resourceId="new"
                label="Attachments"
                maxBytes={10 * 1024 * 1024}
                hint="Photos, technical documents or drawings, up to 10 MB each"
                initialFiles={flash?.attachments}
              />
            </Field>

            <div className="flex items-center gap-3">
              <SubmitButton className="btn-primary btn-lg" pendingText="Sending…">Send request</SubmitButton>
              <Link href="/jobs" className="btn-ghost">
                Cancel
              </Link>
            </div>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
