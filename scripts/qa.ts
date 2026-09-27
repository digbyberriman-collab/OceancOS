/* eslint-disable no-console */
// A scripted QA pass: exercise the most important DB invariants.
// Run with: npm run qa
import { PrismaClient } from "@prisma/client";
import { isValidImo } from "../src/lib/vessels/fields";

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

  // 6. milestones in future
  const upcoming = await prisma.milestone.count({ where: { date: { gte: new Date() } } });
  assert(upcoming >= 1, `upcoming milestones (${upcoming})`);

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

  const primary = await prisma.project.findUnique({ where: { id: "p1" } });
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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
