// Which vessel areas a project's forms may offer and accept.
//
// Areas belong to a vessel, not a project, and Draak now carries both its own
// areas and the demo workspace's. A project offers its vessel's areas on its
// own side of the demo line, and a submitted area is checked against the same
// rule rather than trusted from the form.

import { prisma } from "./db";
import { invalid } from "./errors";

type AreaProject = { vesselId: string; isDemo: boolean };

/** The `where` for the areas a project's forms offer. */
export function areaWhereForProject(project: AreaProject) {
  return { vesselId: project.vesselId, isDemo: project.isDemo };
}

/** Refuse an area that is not one of the project's own. Blank is allowed. */
export async function assertAreaForProject(
  areaId: string | null | undefined,
  project: AreaProject,
): Promise<void> {
  if (!areaId) return;
  const area = await prisma.vesselArea.findFirst({
    where: { id: areaId, ...areaWhereForProject(project) },
    select: { id: true },
  });
  if (!area) throw invalid("That area is not on this project's vessel.");
}
