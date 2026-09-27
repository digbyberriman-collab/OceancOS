/* eslint-disable no-console */
// Load the yard-period register into the database: each vessel's historical
// refits, rebuilds, repairs and surveys, as completed projects.
//
//   npm run yardperiods:import                       # the committed register
//   npm run yardperiods:import -- path/to/file.xlsx  # a newer edition
//   npm run yardperiods:import -- --overwrite        # let the workbook replace held values
//   npm run yardperiods:import -- --check            # report what would change; exit 1 if anything would
//
// Needs the vessel register loaded first (npm run vessels:import): vessels
// are matched by yard number. Creates no accounts, so it is safe to run
// against production. Without --overwrite it only fills blanks and adds new
// scope lines, evidence, gaps and observations; nothing is ever removed.
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_YARD_REGISTER_PATH,
  readYardPeriodRegister,
} from "../src/lib/yardPeriods/workbook";
import { importYardPeriods, isNoChange } from "../src/lib/yardPeriods/importRegister";

async function main() {
  const args = process.argv.slice(2);
  const overwrite = args.includes("--overwrite");
  const check = args.includes("--check");
  const path = args.find((a) => !a.startsWith("--")) ?? DEFAULT_YARD_REGISTER_PATH;

  const prisma = new PrismaClient();
  try {
    const register = await readYardPeriodRegister(path);
    console.log(
      `Read ${path} (edition ${register.edition ?? "undated"}): ${register.periods.length} yard periods, ` +
        `${register.conflicts.length} conflicts, ${register.sources.length} sources, ${register.gaps.length} data gaps.`,
    );
    const { summary, warnings } = await importYardPeriods(prisma, register, { overwrite, check });
    console.log(check ? "Would import:" : "Imported:");
    for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`);
    for (const w of warnings) console.warn(`  warning: ${w}`);
    if (check && !isNoChange(summary)) {
      console.error("The database is behind this register. Run `npm run yardperiods:import`.");
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
