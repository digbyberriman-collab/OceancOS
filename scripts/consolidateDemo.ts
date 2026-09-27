/* eslint-disable no-console */
// Move the demo workspace onto Draak (Y709) and mark it as demo data.
//
//   npm run demo:consolidate               # apply
//   npm run demo:consolidate -- --check    # report what would change; exit 1 if anything would
//
// For a database seeded before the demo moved: the walkthrough projects,
// their milestones and areas move off the invented vessels M/Y Solstice and
// M/Y Northern Light, which are then removed. A fresh seed already does this.
// Creates no accounts and touches no real vessel's records, so it is safe to
// run against production; see src/lib/demo/consolidate.ts for the refusals.
import { PrismaClient } from "@prisma/client";
import { consolidateDemo, isNoChange } from "../src/lib/demo/consolidate";

async function main() {
  const check = process.argv.slice(2).includes("--check");
  const prisma = new PrismaClient();
  try {
    const summary = await consolidateDemo(prisma, { check });
    console.log(check ? "Would change:" : "Changed:");
    for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`);
    if (check && !isNoChange(summary)) {
      console.error("The demo workspace is not where it belongs. Run `npm run demo:consolidate`.");
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
