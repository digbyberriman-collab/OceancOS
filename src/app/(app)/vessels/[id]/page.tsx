import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { loadVesselDetail } from "@/lib/vessels/access";
import { VesselDetailView } from "@/components/vessel/VesselDetailView";

export const dynamic = "force-dynamic";

export default async function VesselPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; err?: string };
}) {
  const user = await requireUser();
  const vessel = await loadVesselDetail(user.id, params.id);
  if (!vessel) return notFound();

  return (
    <VesselDetailView
      vessel={vessel}
      canEdit={hasPermission(user, PERMISSIONS.VESSEL_EDIT)}
      returnTo={`/vessels/${vessel.id}`}
      searchParams={searchParams}
      eyebrow="Fleet register"
    />
  );
}
