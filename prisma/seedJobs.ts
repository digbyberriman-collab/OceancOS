/* eslint-disable no-console */
// Jobs and quotes seed.
//
// A realistic spread across the lifecycle so the list sub-views, the section
// grouping, the money buckets and the expiry label all have something true to
// show. Codes follow the MB92-style scheme decided in §7 item 2.

import type { PrismaClient } from "@prisma/client";
import { groupCodeOf } from "../src/lib/jobs/codes";
import { expiryFrom } from "../src/lib/jobs/workflow";

type JobSeed = {
  code: string;
  title: string;
  description: string;
  contractType: string;
  pricingBasis: string;
  status: string;
  total: number;
  progressPct?: number;
  clientRef?: string;
  validityDays?: number;
  /** Days after arrival that the request was raised. */
  requestedOn: number;
  /** Days after the request that the quote was delivered. */
  quotedAfter?: number;
  /** Days after delivery that the client accepted. */
  acceptedAfter?: number;
  exclusions?: string[];
  notes?: string[];
  variation?: {
    dueTo: string;
    affecting: string;
    deliveryAdjustment?: string;
    priceAdjustment?: number;
    invoicingTerms?: { pct: number; trigger: string }[];
  };
};

const SECTIONS = [
  { letter: "D", name: "Dry Dock", sort: 0 },
  { letter: "E", name: "Engineering & Systems", sort: 1 },
  { letter: "I", name: "Interior", sort: 2 },
  { letter: "P", name: "Projects", sort: 3 },
  { letter: "S", name: "Services", sort: 4 },
];

const JOBS: JobSeed[] = [
  // --- Accepted and progressing -----------------------------------------
  {
    code: "D.0100.10", title: "Anchor chain ranging and calibration",
    description: "Range both anchor chains on the dock floor, calibrate, re-mark and reinstall.",
    contractType: "CONTRACT", pricingBasis: "FIXED", status: "ACCEPTED", total: 18_400,
    progressPct: 100, requestedOn: 2, quotedAfter: 3, acceptedAfter: 4, validityDays: 30,
    exclusions: ["Chain renewal if wastage exceeds class limits.", "Shot blasting of the chain locker."],
    notes: ["Class surveyor attendance to be arranged by the vessel."],
  },
  {
    code: "D.0130.10", title: "Valve overhauling — sea water system",
    description: "Withdraw, overhaul and re-seat all sea water system valves.",
    contractType: "CONTRACT", pricingBasis: "FIXED", status: "ACCEPTED", total: 46_800,
    progressPct: 65, requestedOn: 3, quotedAfter: 4, acceptedAfter: 3, validityDays: 30,
    exclusions: ["Replacement of valve bodies found beyond repair."],
  },
  {
    code: "D.0130.20", title: "Emergency suction valve overhaul",
    description: "Overhaul the main engine emergency suction valve and pressure test.",
    contractType: "VARIATION_CERTIFICATE", pricingBasis: "ESTIMATED", status: "ACCEPTED",
    total: 9_250, progressPct: 40, requestedOn: 12, quotedAfter: 2, acceptedAfter: 2,
    validityDays: 15,
    variation: {
      dueTo: "SURVEY_FINDING", affecting: "WORKS_SPECIFICATION",
      deliveryAdjustment: "Within contract period", priceAdjustment: 9_250,
      invoicingTerms: [{ pct: 50, trigger: "SIGNATURE" }, { pct: 50, trigger: "COMPLETION" }],
    },
  },
  {
    code: "E.2010.10", title: "Oily water separator inspection",
    description: "Open, inspect and certify the oily water separator. Renew filter elements.",
    contractType: "CONTRACT", pricingBasis: "FIXED", status: "YARD_COMPLETED", total: 6_900,
    progressPct: 100, requestedOn: 5, quotedAfter: 2, acceptedAfter: 3, validityDays: 30,
    notes: ["Certificate to be issued on completion."],
  },
  {
    code: "E.2020.10", title: "Starboard main engine gearbox service",
    description: "Annual service of the starboard main engine gearbox, including oil analysis.",
    contractType: "CONTRACT", pricingBasis: "FIXED", status: "WORKS_ACCEPTED", total: 21_300,
    progressPct: 100, requestedOn: 6, quotedAfter: 3, acceptedAfter: 2, validityDays: 30,
  },
  {
    code: "I.4015.10", title: "Annual service — guest lift",
    description: "Annual service and certification of the guest lift by the maker's technician.",
    contractType: "SERVICES", pricingBasis: "FIXED", status: "WORKS_ACCEPTED", total: 4_750,
    progressPct: 100, requestedOn: 8, quotedAfter: 2, acceptedAfter: 1, validityDays: 30,
    clientRef: "MY-2026-011",
  },
  {
    code: "P.1000.10", title: "Helipad stern delrin fitting",
    description: "Manufacture and fit replacement delrin bearing blocks to the helipad stern fitting.",
    contractType: "CONTRACT", pricingBasis: "FIXED", status: "MINOR_DEFICIENCY", total: 12_800,
    progressPct: 100, requestedOn: 14, quotedAfter: 4, acceptedAfter: 3, validityDays: 30,
  },

  // --- Quoted, awaiting the client --------------------------------------
  {
    code: "I.2200.20", title: "Additional exterior covers",
    description: "Manufacture additional exterior covers for the sundeck furniture in matching fabric.",
    contractType: "VARIATION_CERTIFICATE", pricingBasis: "FIXED", status: "QUOTE_SENT",
    total: 14_600, requestedOn: 40, quotedAfter: 5, validityDays: 30,
    clientRef: "MY-2026-024",
    variation: {
      dueTo: "OWNER_REQUEST", affecting: "WORKS_SPECIFICATION",
      deliveryAdjustment: "Within contract period", priceAdjustment: 14_600,
      invoicingTerms: [{ pct: 50, trigger: "SIGNATURE" }, { pct: 50, trigger: "COMPLETION" }],
    },
    exclusions: ["Removal and refitting of existing covers."],
  },
  {
    code: "E.2500.10", title: "Sludge and waste oil disposal",
    description: "Pump out, transport and certified disposal of sludge and waste oil.",
    contractType: "SERVICES", pricingBasis: "TIME_AND_MATERIALS", status: "QUOTE_SENT",
    total: 3_400, requestedOn: 44, quotedAfter: 2, validityDays: 15,
    notes: ["Quantities are estimated; final quantity invoiced on the weighbridge ticket."],
  },
  {
    code: "P.2200.10", title: "Grease trap piping modification",
    description: "Modify the galley grease trap discharge piping to improve access for servicing.",
    contractType: "VARIATION_CERTIFICATE", pricingBasis: "ESTIMATED", status: "QUOTE_SENT",
    total: 7_950, requestedOn: 48, quotedAfter: 3, validityDays: 20,
    variation: { dueTo: "YARD_FINDING", affecting: "WORKS_SPECIFICATION", priceAdjustment: 7_950 },
  },

  // --- Expired ------------------------------------------------------------
  {
    code: "I.2300.10", title: "Wrapping of interior surfaces",
    description: "Protective wrapping of interior surfaces in the main saloon for the duration of works.",
    contractType: "VARIATION_CERTIFICATE", pricingBasis: "FIXED", status: "EXPIRED",
    total: 5_200, requestedOn: 18, quotedAfter: 3, validityDays: 5,
    variation: { dueTo: "OWNER_REQUEST", affecting: "WORKS_SPECIFICATION", priceAdjustment: 5_200 },
  },

  // --- New requests, not yet priced --------------------------------------
  {
    code: "D.0400.10", title: "Bow thruster tunnel anode renewal",
    description: "Renew sacrificial anodes in both bow thruster tunnels and record thicknesses.",
    contractType: "CONTRACT", pricingBasis: "FIXED", status: "NEW_REQUEST", total: 0,
    requestedOn: 62,
  },
  {
    code: "S.7000.10", title: "Additional shore power cable",
    description: "Supply and terminate an additional 125A shore power cable.",
    contractType: "PURCHASE", pricingBasis: "FIXED", status: "NEW_REQUEST", total: 0,
    requestedOn: 66, clientRef: "MY-2026-031",
  },

  // --- Cancelled ----------------------------------------------------------
  {
    code: "I.4000.20", title: "Wine fridge frame removal",
    description: "Remove and refit the wine fridge frame to allow access behind the unit.",
    contractType: "VARIATION_CERTIFICATE", pricingBasis: "FIXED", status: "CANCELLED_QUOTE",
    total: 2_100, requestedOn: 30, quotedAfter: 3, validityDays: 15,
  },
  {
    code: "P.4005.10", title: "Imitation teak sample panel",
    description: "Produce an imitation teak sample panel for the owner's approval.",
    contractType: "SERVICES", pricingBasis: "FIXED", status: "CANCELLED_WORKS", total: 1_850,
    requestedOn: 22, quotedAfter: 2, acceptedAfter: 2, validityDays: 30,
  },
];

const DAY = 24 * 60 * 60 * 1000;

export async function seedJobs(prisma: PrismaClient, projectId: string, arrival: Date) {
  const pm = await prisma.user.findUnique({ where: { email: "pm@oceancos.dev" } });
  const yard = await prisma.user.findUnique({ where: { email: "yard@oceancos.dev" } });
  const captain = await prisma.user.findUnique({ where: { email: "captain@oceancos.dev" } });
  if (!pm || !yard || !captain) return;

  for (const section of SECTIONS) {
    await prisma.jobSection.upsert({
      where: { projectId_letter: { projectId, letter: section.letter } },
      update: { name: section.name, sort: section.sort },
      create: { projectId, ...section },
    });
  }
  const sections = await prisma.jobSection.findMany({ where: { projectId } });
  const sectionByLetter = new Map(sections.map((s) => [s.letter, s.id]));

  for (const seed of JOBS) {
    const existing = await prisma.job.findUnique({
      where: { projectId_code: { projectId, code: seed.code } },
    });
    if (existing) continue;

    const requestedAt = new Date(arrival.getTime() + seed.requestedOn * DAY);
    const quoteDeliveredAt =
      seed.quotedAfter != null ? new Date(requestedAt.getTime() + seed.quotedAfter * DAY) : null;
    const clientAcceptedAt =
      quoteDeliveredAt && seed.acceptedAfter != null
        ? new Date(quoteDeliveredAt.getTime() + seed.acceptedAfter * DAY)
        : null;
    const expiresAt = quoteDeliveredAt ? expiryFrom(quoteDeliveredAt, seed.validityDays) : null;

    const accepted = ["ACCEPTED", "YARD_COMPLETED", "MINOR_DEFICIENCY", "WORKS_ACCEPTED", "CLOSED"].includes(seed.status);
    const yardAcceptedAt = accepted && clientAcceptedAt ? new Date(clientAcceptedAt.getTime() + DAY) : null;

    await prisma.job.create({
      data: {
        projectId,
        sectionId: sectionByLetter.get(seed.code[0]) ?? null,
        code: seed.code,
        groupCode: groupCodeOf(seed.code),
        clientRef: seed.clientRef ?? null,
        title: seed.title,
        description: seed.description,
        contractType: seed.contractType,
        pricingBasis: seed.pricingBasis,
        status: seed.status,
        total: seed.total,
        progressPct: seed.progressPct ?? 0,
        requestedAt,
        quoteDeliveredAt,
        validityDays: seed.validityDays ?? null,
        expiresAt,
        clientAcceptedAt,
        clientAcceptedById: clientAcceptedAt ? captain.id : null,
        yardAcceptedAt,
        yardAcceptedById: yardAcceptedAt ? yard.id : null,
        yardCompletedAt: ["YARD_COMPLETED", "MINOR_DEFICIENCY", "WORKS_ACCEPTED"].includes(seed.status)
          ? new Date((yardAcceptedAt ?? requestedAt).getTime() + 20 * DAY)
          : null,
        worksAcceptedAt: seed.status === "WORKS_ACCEPTED"
          ? new Date((yardAcceptedAt ?? requestedAt).getTime() + 24 * DAY)
          : null,
        warrantyMonths: seed.status === "WORKS_ACCEPTED" ? 12 : null,
        cancelledAt: seed.status.startsWith("CANCELLED")
          ? new Date(requestedAt.getTime() + 10 * DAY)
          : null,
        cancelReason: seed.status === "CANCELLED_QUOTE"
          ? "Deferred to the next yard period."
          : seed.status === "CANCELLED_WORKS"
            ? "Owner withdrew the request after the sample was agreed verbally."
            : null,
        designatedAuthoriserId: captain.id,
        createdById: pm.id,
        createdAt: requestedAt,
        lines: seed.total > 0
          ? {
              create: [
                {
                  sort: 0,
                  description: "Labour — skilled worker",
                  quantity: Math.max(1, Math.round((seed.total * 0.6) / 67.5)),
                  unit: "HR",
                  unitPrice: 67.5,
                  total: Math.round(seed.total * 0.6),
                },
                {
                  sort: 1,
                  description: "Materials and consumables",
                  quantity: 1,
                  unit: "UN",
                  unitPrice: Math.round(seed.total * 0.4),
                  total: Math.round(seed.total * 0.4),
                },
              ],
            }
          : undefined,
        notes: {
          create: [
            ...(seed.exclusions ?? []).map((text, sort) => ({ kind: "EXCLUSION", sort, text })),
            ...(seed.notes ?? []).map((text, sort) => ({ kind: "NOTE", sort, text })),
          ],
        },
        variation: seed.variation
          ? {
              create: {
                dueTo: seed.variation.dueTo,
                affecting: seed.variation.affecting,
                deliveryAdjustment: seed.variation.deliveryAdjustment ?? null,
                priceAdjustment: seed.variation.priceAdjustment ?? null,
                invoicingTerms: seed.variation.invoicingTerms ?? undefined,
              },
            }
          : undefined,
        history: {
          create: [
            { actorId: pm.id, event: "CREATED", toStatus: "NEW_REQUEST", createdAt: requestedAt },
            ...(quoteDeliveredAt
              ? [{ actorId: yard.id, event: "QUOTED", fromStatus: "NEW_REQUEST", toStatus: "QUOTE_SENT", createdAt: quoteDeliveredAt }]
              : []),
            ...(clientAcceptedAt
              ? [{ actorId: captain.id, event: "CLIENT_ACCEPTED", fromStatus: "QUOTE_SENT", toStatus: "CLIENT_ACCEPTED", createdAt: clientAcceptedAt }]
              : []),
            ...(yardAcceptedAt
              ? [{ actorId: yard.id, event: "COUNTERSIGNED", fromStatus: "CLIENT_ACCEPTED", toStatus: "ACCEPTED", createdAt: yardAcceptedAt }]
              : []),
          ],
        },
      },
    });
  }

  // A conversation on the job that is furthest along, including a minute.
  const conversational = await prisma.job.findUnique({
    where: { projectId_code: { projectId, code: "D.0130.10" } },
  });
  if (conversational) {
    const existing = await prisma.comment.count({ where: { jobId: conversational.id } });
    if (existing === 0) {
      await prisma.comment.createMany({
        data: [
          {
            authorId: captain.id, resource: "Job", resourceId: conversational.id,
            jobId: conversational.id, kind: "MESSAGE",
            body: "Can you confirm whether the sea chest valves are included in this scope?",
            createdAt: new Date(conversational.createdAt.getTime() + 2 * DAY),
          },
          {
            authorId: yard.id, resource: "Job", resourceId: conversational.id,
            jobId: conversational.id, kind: "MESSAGE",
            body: "They are not. Sea chest valves would be a separate variation — happy to price it.",
            createdAt: new Date(conversational.createdAt.getTime() + 2 * DAY + 3600_000),
          },
          {
            authorId: pm.id, resource: "Job", resourceId: conversational.id,
            jobId: conversational.id, kind: "MINUTE",
            body: "Agreed at the daily meeting: sea chest valves to be quoted separately once the tanks are gas free.",
            createdAt: new Date(conversational.createdAt.getTime() + 3 * DAY),
          },
        ],
      });
    }
  }

  const count = await prisma.job.count({ where: { projectId } });
  console.log(`  jobs: ${count}`);
}
