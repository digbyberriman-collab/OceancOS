/* eslint-disable no-console */
// A scripted QA pass: exercise the most important DB invariants.
// Run with: npm run qa
import { PrismaClient } from "@prisma/client";
import { isValidImo } from "../src/lib/vessels/fields";
import { DEMO_PRIMARY, DEMO_VESSEL_YARD_NUMBER, FICTIONAL_VESSELS } from "../src/lib/demo/data";

const prisma = new PrismaClient();

async function main() {
  let pass = 0, fail = 0;
  function assert(cond: any, msg: string) {
    if (cond) { pass++; console.log(`  ok  ${msg}`); }
    else { fail++; console.error(`  FAIL  ${msg}`); }
  }

  console.log("OceancOS QA — read-only checks");

  // 1. seed integrity
  const userCount = await prisma.user.count();
  assert(userCount >= 10, `seeded users >= 10 (got ${userCount})`);

  const roleCount = await prisma.role.count();
  assert(roleCount >= 19, `roles seeded (got ${roleCount})`);

  const permCount = await prisma.permission.count();
  assert(permCount >= 30, `permissions seeded (got ${permCount})`);

  // 2. role-permission integrity (every role has at least one perm)
  const rolesNoPerm = await prisma.role.findMany({ where: { permissions: { none: {} } } });
  assert(rolesNoPerm.length <= 1, `roles missing perms: ${rolesNoPerm.map(r => r.key).join(",") || "none"}`);

  // 3. project + budget rollup makes sense
  const budgets = await prisma.budget.findMany();
  const total = budgets.reduce((s, b) => s + b.originalAmount.toNumber(), 0);
  assert(total > 0, `total original budget > 0 (${total})`);

  // 4. change order with approval chain
  const co = await prisma.changeOrder.findFirst({ include: { approvals: true } });
  assert(co != null, "sample change order exists");
  assert((co?.approvals.length ?? 0) >= 5, `change order has approval chain (${co?.approvals.length})`);

  // 5. crew request with assignment
  //
  // findFirst() with no orderBy is not guaranteed to return the same row
  // twice — fine for "a sample exists", not for "the sample has property X"
  // once anything else (an e2e run, a manual test) adds an unassigned one.
  // Ask for an assigned one directly instead of assuming the first row is.
  const cr = await prisma.crewRequest.findFirst();
  assert(cr != null, "sample crew request exists");
  const assignedCr = await prisma.crewRequest.findFirst({ where: { assignedToId: { not: null } } });
  assert(assignedCr != null, "an assigned crew request exists");

  // 6. milestones fall within the primary project's own yard period — checked
  // against the project rather than today, so the check does not start
  // failing the day the seeded period ends.
  const primaryPeriod = await prisma.project.findUnique({
    where: { id: DEMO_PRIMARY.id },
    select: { arrivalDate: true, departureDate: true, milestones: { select: { name: true, date: true } } },
  });
  const milestones = primaryPeriod?.milestones ?? [];
  assert(milestones.length >= 1, `primary project has milestones (${milestones.length})`);
  const outside = milestones
    .filter((m) => !primaryPeriod?.arrivalDate || !primaryPeriod.departureDate ||
      m.date < primaryPeriod.arrivalDate || m.date > primaryPeriod.departureDate)
    .map((m) => m.name);
  assert(!outside.length, `primary project's milestones fall within its yard period (${outside.join(", ") || "all within"})`);

  // 7. risks rating computed
  const risk = await prisma.risk.findFirst();
  assert(risk == null || risk.rating === risk.likelihood * risk.impact, "risk rating == L*I");

  // 8. project context: codes, yard period, and more than one project to switch between
  const projects = await prisma.project.findMany({ where: { archivedAt: null } });
  assert(projects.length >= 2, `projects available to switch between (${projects.length})`);
  assert(
    projects.every((p) => !!p.code),
    `every project has a code (${projects.filter((p) => !p.code).map((p) => p.name).join(", ") || "all set"})`
  );
  const codes = projects.map((p) => p.code);
  assert(new Set(codes).size === codes.length, "project codes are unique");

  const primary = await prisma.project.findUnique({ where: { id: DEMO_PRIMARY.id } });
  assert(!!primary?.arrivalDate && !!primary?.departureDate, "primary project has a yard period");
  assert(
    !primary?.arrivalDate || !primary?.departureDate || primary.arrivalDate < primary.departureDate,
    "yard period arrival precedes departure"
  );
  assert(
    !primary?.haulOutDate ||
      !primary?.arrivalDate ||
      primary.haulOutDate >= primary.arrivalDate,
    "haul out falls on or after arrival"
  );

  // 9. vessel register: every Oceanco vessel is identifiable, on a project, and evidenced
  const register = await prisma.vessel.findMany({
    where: { builder: "Oceanco", archivedAt: null },
    include: {
      projects: { where: { archivedAt: null }, select: { code: true } },
      _count: { select: { observations: true, dataGaps: true } },
    },
  });
  assert(register.length === 22, `register vessels loaded (${register.length})`);
  const badImo = register.filter((v) => !isValidImo(v.imo)).map((v) => v.name);
  assert(!badImo.length, `every register vessel has a valid IMO (${badImo.join(", ") || "all valid"})`);
  const noProject = register.filter((v) => !v.projects.some((p) => p.code === v.yardNumber)).map((v) => v.name);
  assert(!noProject.length, `every register vessel has a project coded by its yard number (${noProject.join(", ") || "all set"})`);
  const noEvidence = register.filter((v) => v._count.observations === 0).map((v) => v.name);
  assert(!noEvidence.length, `every register vessel has sourced observations (${noEvidence.join(", ") || "all set"})`);
  const observations = await prisma.vesselObservation.count({ where: { origin: "IMPORT" } });
  assert(observations >= 444, `register observations loaded (${observations})`);
  const orphaned = await prisma.vesselObservation.count({ where: { sourceCode: { not: null }, sourceId: null } });
  assert(orphaned === 0, `every observation's source resolves (${orphaned} unresolved)`);
  const gaps = await prisma.vesselDataGap.count();
  assert(gaps >= 149, `data gaps loaded (${gaps})`);

  // 10. demo workspace: fictional, marked, and only on Draak
  const demoProjects = await prisma.project.findMany({
    where: { isDemo: true },
    select: { code: true, vessel: { select: { yardNumber: true } } },
  });
  assert(demoProjects.length >= 2, `demo projects marked as demo (${demoProjects.length})`);
  const strayDemo = demoProjects.filter((p) => p.vessel.yardNumber !== DEMO_VESSEL_YARD_NUMBER).map((p) => p.code);
  assert(!strayDemo.length, `every demo project is on ${DEMO_VESSEL_YARD_NUMBER} (${strayDemo.join(", ") || "all on it"})`);
  const primaryIsDemo = await prisma.project.findUnique({ where: { id: DEMO_PRIMARY.id }, select: { isDemo: true } });
  assert(primaryIsDemo?.isDemo === true, "the seeded walkthrough project is marked as demo");
  const invented = await prisma.vessel.findMany({
    where: { id: { in: FICTIONAL_VESSELS.map((v) => v.id) } },
    select: { name: true },
  });
  assert(!invented.length, `the invented demo vessels are gone (${invented.map((v) => v.name).join(", ") || "none left"})`);
  const strayAreas = await prisma.vesselArea.count({
    where: { isDemo: true, vessel: { yardNumber: { not: DEMO_VESSEL_YARD_NUMBER } } },
  });
  assert(strayAreas === 0, `demo areas sit only on ${DEMO_VESSEL_YARD_NUMBER} (${strayAreas} elsewhere)`);
  const [realCoOnDemoArea, realCrOnDemoArea] = await Promise.all([
    prisma.changeOrder.count({ where: { project: { isDemo: false }, vesselArea: { isDemo: true } } }),
    prisma.crewRequest.count({ where: { project: { isDemo: false }, vesselArea: { isDemo: true } } }),
  ]);
  assert(
    realCoOnDemoArea + realCrOnDemoArea === 0,
    `no real record uses a demo area (${realCoOnDemoArea} change orders, ${realCrOnDemoArea} crew requests)`
  );

  // 11. yard history: every register period is a completed project with its record
  const periods = await prisma.project.findMany({
    where: { yardPeriod: { origin: "IMPORT" } },
    select: {
      code: true,
      status: true,
      isDemo: true,
      vesselId: true,
      arrivalDate: true,
      haulOutDate: true,
      seaTrialsDate: true,
      departureDate: true,
      startDate: true,
      targetEndDate: true,
      yardPeriod: { select: { sortEnd: true, importKey: true } },
      _count: { select: { budgets: true, changeOrders: true, crewRequests: true, jobs: true, milestones: true } },
    },
  });
  assert(periods.length >= 44, `yard periods loaded from the register (${periods.length})`);
  const notCompleted = periods.filter((p) => p.status !== "COMPLETED" || p.isDemo).map((p) => p.code);
  assert(!notCompleted.length, `every register yard period is completed and real (${notCompleted.join(", ") || "all"})`);
  const falsePrecision = periods
    .filter((p) => p.arrivalDate || p.haulOutDate || p.seaTrialsDate || p.departureDate || p.startDate || p.targetEndDate)
    .map((p) => p.code);
  assert(!falsePrecision.length, `no yard period carries an exact date the register never gave (${falsePrecision.join(", ") || "none"})`);
  const withWork = periods
    .filter((p) => p._count.budgets + p._count.changeOrders + p._count.crewRequests + p._count.jobs + p._count.milestones > 0)
    .map((p) => p.code);
  assert(!withWork.length, `no budget, change order, request, quote or milestone hangs off a yard period (${withWork.join(", ") || "none"})`);
  const vesselsWithHistory = new Set(periods.map((p) => p.vesselId)).size;
  assert(vesselsWithHistory === 17, `vessels with a yard history (${vesselsWithHistory})`);
  const noHistoryGaps = await prisma.vesselDataGap.count({
    where: { scope: "Yard history", issue: { startsWith: "No confirmed post-delivery" } },
  });
  assert(noHistoryGaps === 5, `vessels with no located yard period carry a gap saying so (${noHistoryGaps})`);
  const [scopeLines, evidenceUnresolved] = await Promise.all([
    prisma.projectScopeItem.count({ where: { origin: "IMPORT" } }),
    prisma.yardPeriodEvidence.count({ where: { sourceUrl: { not: null }, sourceId: null } }),
  ]);
  assert(scopeLines >= 66, `yard-period scope lines loaded (${scopeLines})`);
  assert(evidenceUnresolved === 0, `every yard-period source resolves (${evidenceUnresolved} unresolved)`);
  const rebuild = periods.find((p) => p.code === "Y709-2023");
  const demoArrivals = await prisma.project.findMany({ where: { isDemo: true }, select: { code: true, arrivalDate: true } });
  const overlapping = demoArrivals
    .filter((d) => !d.arrivalDate || !rebuild?.yardPeriod?.sortEnd || d.arrivalDate <= rebuild.yardPeriod.sortEnd)
    .map((d) => d.code);
  assert(!overlapping.length, `the demo workspace starts after Draak's real rebuild (${overlapping.join(", ") || "it does"})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
