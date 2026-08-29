import { PrismaClient } from "@prisma/client";
import { ensureLegacyUnits } from "../src/lib/legacy-import";

const prisma = new PrismaClient();

/**
 * Production-safe companion to prisma/seed.ts. Adds ONLY the 3 units
 * (FS/FT/FIK) that the BP3M legacy SK import needs — nothing else.
 *
 * Deliberately does NOT touch User/demo accounts, unlike seed.ts (which
 * the README explicitly says must never run against production — it
 * creates/updates demo accounts including a SUPER_ADMIN with a fresh
 * random password). This script only upserts Unit rows, so it's safe to
 * run against a real production database — though see
 * src/app/api/legacy-decrees/import/route.ts for why that ended up not
 * being usable against this project's actual production DB (Vercel
 * "Secret"-type env vars are write-only, so DATABASE_URL couldn't be
 * read out to run this locally).
 */
async function main() {
  const results = await ensureLegacyUnits(prisma);
  for (const r of results) console.log(`[ensure-legacy-units] ${r.code} -> ${r.id}`);
}

main()
  .catch((err) => {
    console.error("[ensure-legacy-units] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
