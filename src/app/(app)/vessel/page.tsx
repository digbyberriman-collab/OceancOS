import { Anchor } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { getActiveProject } from "@/lib/project";
import { loadVesselDetail } from "@/lib/vessels/access";
import { EmptyState } from "@/components/ui/EmptyState";
import { VesselDetailView } from "@/components/vessel/VesselDetailView";

export const dynamic = "force-dynamic";

/** The vessel of the project chosen in the header. */
export default async function ActiveVesselPage({
  searchParams,
}: {
  searchParams: { saved?: string; err?: string };
}) {
  const user = await requireUser();
  const project = await getActiveProject(user.id);
  if (!project) {
    return (
      <EmptyState
        icon={<Anchor size={20} />}
        title="No project selected"
        hint="You are not on any project yet, so there is no vessel to show."
      />
    );
  }

  const vessel = await loadVesselDetail(user.id, project.vesselId);
  if (!vessel) return <EmptyState icon={<Anchor size={20} />} title="Vessel not available" />;

  return (
    <VesselDetailView
      vessel={vessel}
      canEdit={hasPermission(user, PERMISSIONS.VESSEL_EDIT)}
      returnTo="/vessel"
      searchParams={searchParams}
      eyebrow={`Vessel · ${project.code ?? project.name}`}
    />
  );
}
