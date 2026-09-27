/* eslint-disable no-console */
// Load a vessel register workbook into the database.
//
//   npm run vessels:import                       # the committed register
//   npm run vessels:import -- path/to/file.xlsx  # a newer edition
//   npm run vessels:import -- --overwrite        # let the workbook replace held values
//
// Creates no accounts, so it is safe to run against production. Without
// --overwrite it only fills blanks, adds new observations and adds new gaps.
import { PrismaClient } from "@prisma/client";
import { DEFAULT_REGISTER_PATH, readVesselRegister } from "../src/lib/vessels/workbook";
import { importVesselRegister } from "../src/lib/vessels/importRegister";

async function main() {
  const args = process.argv.slice(2);
  const overwrite = args.includes("--overwrite");
  const path = args.find((a) => !a.startsWith("--")) ?? DEFAULT_REGISTER_PATH;

  const prisma = new PrismaClient();
  try {
    const register = await readVesselRegister(path);
    console.log(
      `Read ${path}: ${register.vessels.length} vessels, ${register.observations.length} observations, ` +
        `${register.sources.length} sources, ${register.gaps.length} data gaps.`
    );
    const summary = await importVesselRegister(prisma, register, { overwrite });
    console.log("Imported:");
    for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
