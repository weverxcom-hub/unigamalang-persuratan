import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Production-safe companion to prisma/seed.ts. Adds ONLY the 3 units
 * (FS/FT/FIK) that the BP3M legacy SK import needs — nothing else.
 *
 * Deliberately does NOT touch User/demo accounts, unlike seed.ts (which
 * the README explicitly says must never run against production — it
 * creates/updates demo accounts including a SUPER_ADMIN with a fresh
 * random password). This script only upserts Unit rows, so it's safe to
 * run against a real production database.
 *
 * Run before prisma/import-legacy-decrees.ts, which throws if these units
 * don't already exist.
 */
async function main() {
  const units = [
    { code: "FS", name: "Fakultas Sastra" },
    { code: "FT", name: "Fakultas Teknik" },
    { code: "FIK", name: "Fakultas Ilmu Komputer" },
  ];
  for (const u of units) {
    const result = await prisma.unit.upsert({
      where: { code: u.code },
      update: { name: u.name },
      create: { ...u },
    });
    console.log(`[ensure-legacy-units] ${u.code} -> ${result.id}`);
  }

  const skType = await prisma.letterType.findUnique({ where: { code: "SK" } });
  const edarType = await prisma.letterType.findUnique({ where: { code: "EDAR" } });
  if (!skType || !edarType) {
    console.warn(
      "[ensure-legacy-units] WARNING: LetterType SK and/or EDAR not found. " +
        "import-legacy-decrees.ts will fail without them. This script doesn't " +
        "create letter types (out of scope — check whether this database ever " +
        "ran the base seed, and if not, that needs its own review before " +
        "adding SK/EDAR here)."
    );
  } else {
    console.log(`[ensure-legacy-units] LetterType SK -> ${skType.id}, EDAR -> ${edarType.id} (already present)`);
  }
}

main()
  .catch((err) => {
    console.error("[ensure-legacy-units] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
