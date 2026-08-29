import { PrismaClient } from "@prisma/client";
import { importLegacyDecrees } from "../src/lib/legacy-import";

const prisma = new PrismaClient();

/**
 * Import of the BP3M SK/SE recap (1987–2026, 325 rows) into LegacyDecree.
 * Source: prisma/legacy-data/sk-bp3m-1987-2026.json.
 *
 * Idempotent: upserts by `noUrutAsli` (unique), so re-running after fixing
 * a row in the source JSON just updates that row rather than duplicating.
 * isPublic is only ever set on first create — never overwritten on
 * update — so a manual admin review decision (via
 * /dashboard/legacy-decrees) always survives a re-run of this script.
 *
 * Requires prisma/ensure-legacy-units.ts (or the equivalent in-app
 * trigger) to have run first — throws if FS/FT/FIK units or the SK/EDAR
 * letter types don't exist yet.
 *
 * Shared implementation: src/lib/legacy-import.ts. Also reachable from
 * inside the running app via POST /api/legacy-decrees/import, for
 * environments (like this project's actual Vercel production) where
 * DATABASE_URL is a write-only "Secret" env var that can't be read out
 * to run this script locally.
 */
async function main() {
  console.log("[import-legacy-decrees] Starting...");
  const result = await importLegacyDecrees(prisma);
  console.log(
    `[import-legacy-decrees] Done. total=${result.total} created=${result.created} ` +
      `updated=${result.updated} skipped=${result.skipped} ` +
      `(${result.hiddenCount} row(s) currently isPublic=false — review via ` +
      `/dashboard/legacy-decrees)`
  );
}

main()
  .catch((err) => {
    console.error("[import-legacy-decrees] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
