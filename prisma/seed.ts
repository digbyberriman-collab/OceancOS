/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_KEYS, DEPARTMENTS } from "../src/lib/enums";
import { ROLE_PERMISSIONS, PERMISSIONS } from "../src/lib/rbac";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding OceancOS…");

  // Permissions
  const allPermKeys = Array.from(new Set(Object.values(PERMISSIONS)));
  for (const key of allPermKeys) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, label: key },
    });
  }

  // Roles + role-permission mapping
  for (const roleKey of ROLE_KEYS) {
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: { name: roleKey },
      create: { key: roleKey, name: roleKey },
    });
    const desired = ROLE_PERMISSIONS[roleKey];
    // wipe and reset
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permKey of desired) {
      const perm = await prisma.permission.findUnique({ where: { key: permKey } });
      if (!perm) continue;
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
  }

  // Departments
  for (const code of DEPARTMENTS) {
    await prisma.department.upsert({ where: { name: code }, update: {}, create: { name: code, code } });
  }

  // Vessel + project + areas
  const vessel = await prisma.vessel.upsert({
    where: { id: "v1" },
    update: {},
    create: { id: "v1", name: "M/Y Solstice", flag: "Cayman", loa: 95, builtYear: 2018 },
  });

  const project = await prisma.project.upsert({
    where: { id: "p1" },
    update: {},
    create: {
      id: "p1",
      vesselId: vessel.id,
      name: "2026 Refit",
      type: "REFIT",
      startDate: new Date("2026-03-01"),
      targetEndDate: new Date("2026-09-30"),
    },
  });

  const areaSeeds = ["Owner's Suite", "Bridge", "Engine Room", "Tender Garage", "Galley", "Sundeck"];
  for (const name of areaSeeds) {
    const exists = await prisma.vesselArea.findFirst({ where: { vesselId: vessel.id, name } });
    if (!exists) await prisma.vesselArea.create({ data: { vesselId: vessel.id, name } });
  }

  // Users
  const passwordHash = await bcrypt.hash("password", 10);
  const userSeeds: { email: string; name: string; role: typeof ROLE_KEYS[number] }[] = [
    { email: "owner@oceancos.dev", name: "Alex Owner", role: "OWNER" },
    { email: "rep@oceancos.dev", name: "Robin Rep", role: "OWNERS_REP" },
    { email: "pm@oceancos.dev", name: "Pat Manager", role: "PROJECT_MANAGER" },
    { email: "captain@oceancos.dev", name: "Cara Captain", role: "CAPTAIN" },
    { email: "eng@oceancos.dev", name: "Ed Engineer", role: "CHIEF_ENGINEER" },
    { email: "crew@oceancos.dev", name: "Charlie Crew", role: "CREW" },
    { email: "yard@oceancos.dev", name: "Yara Yard", role: "YARD_PM" },
    { email: "finance@oceancos.dev", name: "Fin Finance", role: "FINANCE" },
    { email: "tech@oceancos.dev", name: "Tess Tech", role: "TECH_MANAGER" },
    { email: "class@oceancos.dev", name: "Carl Class", role: "CLASS_SURVEYOR" },
    { email: "flag@oceancos.dev", name: "Flo Flag", role: "FLAG_SURVEYOR" },
    { email: "contractor@oceancos.dev", name: "Connor Contractor", role: "CONTRACTOR" },
  ];

  for (const u of userSeeds) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name, passwordHash },
    });
    const role = await prisma.role.findUnique({ where: { key: u.role } });
    if (role) {
      const exists = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
      if (!exists) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }
  }

  // Budget categories
  const categoryNames = ["Hull & Coatings", "Engineering", "Interior", "AV/IT", "Deck", "Project Management", "Contingency"];
  for (const name of categoryNames) {
    await prisma.budgetCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  const categories = await prisma.budgetCategory.findMany();

  // Budgets
  for (const c of categories) {
    const exists = await prisma.budget.findFirst({ where: { projectId: project.id, categoryId: c.id } });
    if (exists) continue;
    const original = Math.round((Math.random() * 800_000 + 200_000) / 1000) * 1000;
    await prisma.budget.create({
      data: {
        projectId: project.id,
        categoryId: c.id,
        originalAmount: original,
        approvedChanges: Math.round(original * 0.05),
        pendingChanges: Math.round(original * 0.02),
        committed: Math.round(original * 0.4),
        actual: Math.round(original * 0.3),
        forecastFinal: Math.round(original * 1.07),
      },
    });
  }

  // Milestones
  const milestoneSeeds: { name: string; type: string; date: string }[] = [
    { name: "Yard arrival", type: "YARD_PERIOD", date: "2026-03-01" },
    { name: "Class inspection", type: "CLASS_INSPECTION", date: "2026-05-15" },
    { name: "Sea trials", type: "SEA_TRIAL", date: "2026-08-20" },
    { name: "Delivery", type: "DELIVERY", date: "2026-09-30" },
  ];
  for (const m of milestoneSeeds) {
    const exists = await prisma.milestone.findFirst({ where: { projectId: project.id, name: m.name } });
    if (!exists) await prisma.milestone.create({ data: { projectId: project.id, name: m.name, type: m.type, date: new Date(m.date) } });
  }

  // Sample change order with approval chain
  const pm = await prisma.user.findUnique({ where: { email: "pm@oceancos.dev" } });
  const existing = await prisma.changeOrder.findFirst({ where: { projectId: project.id } });
  if (!existing && pm) {
    const stages = ["CAPTAIN", "TECH_MANAGER", "YARD", "OWNERS_REP", "FINANCE"] as const;
    await prisma.changeOrder.create({
      data: {
        projectId: project.id,
        number: "CO-0001",
        title: "Replace owner's suite carpet",
        description: "Replace existing carpet with bespoke wool blend per owner's request.",
        reason: "Owner preference and stain damage from charter season.",
        departmentCode: "INTERIOR",
        priority: "MEDIUM",
        estimatedCost: 38_000,
        scheduleImpactDays: 4,
        status: "SUBMITTED",
        createdById: pm.id,
        updatedById: pm.id,
        approvals: { create: stages.map((stage, idx) => ({ stage, order: idx })) },
        history: { create: { actorId: pm.id, event: "CREATED", toStatus: "SUBMITTED" } },
      },
    });
  }

  // Sample crew request
  const crew = await prisma.user.findUnique({ where: { email: "crew@oceancos.dev" } });
  const eng = await prisma.user.findUnique({ where: { email: "eng@oceancos.dev" } });
  const existingCr = await prisma.crewRequest.findFirst({ where: { projectId: project.id } });
  if (!existingCr && crew && eng) {
    await prisma.crewRequest.create({
      data: {
        projectId: project.id,
        number: "REQ-0001",
        title: "Generator 2 oil leak",
        description: "Slow drip from generator 2 on stbd side. Sump tray catching it for now.",
        category: "ENGINEERING",
        departmentCode: "ENGINEERING",
        priority: "HIGH",
        status: "ASSIGNED",
        requestedById: crew.id,
        assignedToId: eng.id,
        createdById: crew.id,
        updatedById: crew.id,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        safetyImpact: "Slip hazard if leak grows. Monitor.",
      },
    });
  }

  // Sample risks
  const risksData = [
    { title: "Long-lead glass not confirmed", category: "SUPPLY_CHAIN", likelihood: 4, impact: 5, status: "OPEN" },
    { title: "Class delay around stabilisers", category: "REGULATORY", likelihood: 3, impact: 4, status: "OPEN" },
    { title: "Yard quay availability", category: "SCHEDULE", likelihood: 2, impact: 4, status: "MITIGATED" },
  ];
  for (const r of risksData) {
    const exists = await prisma.risk.findFirst({ where: { projectId: project.id, title: r.title } });
    if (!exists) {
      await prisma.risk.create({
        data: {
          projectId: project.id,
          title: r.title,
          category: r.category,
          likelihood: r.likelihood,
          impact: r.impact,
          rating: r.likelihood * r.impact,
          status: r.status,
        },
      });
    }
  }

  // Sample inventory
  const invSeeds = [
    { name: "EPIRB Mk 2", category: "SAFETY", qty: 2, minStock: 2 },
    { name: "Main engine fuel filter", category: "CRITICAL_SPARE", qty: 4, minStock: 6 },
    { name: "Bridge AV controller", category: "AV_IT", qty: 1, minStock: 1 },
    { name: "Tender oil 15W40 (5L)", category: "CONSUMABLE", qty: 3, minStock: 4 },
  ];
  for (const i of invSeeds) {
    const exists = await prisma.inventoryItem.findFirst({ where: { name: i.name, projectId: project.id } });
    if (!exists) {
      await prisma.inventoryItem.create({
        data: {
          ...i,
          projectId: project.id,
          status: i.qty < i.minStock ? "REORDER" : i.qty === i.minStock ? "LOW" : "OK",
          replacementCost: 1500,
        },
      });
    }
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
