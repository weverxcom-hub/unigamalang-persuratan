import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

/**
 * Seeds demo accounts for local development only.
 *
 * Security (audit B1, 2026-08-27): this used to hash a fixed literal
 * ("Password123!") that was also printed in README.md — anyone who could
 * read the repo (public or not) had the SUPER_ADMIN password for any
 * database the seed had ever been run against. Now:
 *   - Refuses to run when NODE_ENV=production unless SEED_CONFIRM=true is
 *     also set, so `npm run db:seed` can't be fat-fingered against a
 *     deployed DATABASE_URL.
 *   - The password is either read from SEED_DEMO_PASSWORD (useful for CI /
 *     scripted local setups) or generated randomly per run and printed once
 *     to the console — never hardcoded, never committed.
 *   - Re-running the seed does NOT reset passwordHash for accounts that
 *     already exist (see the `update:` clause below), so this only matters
 *     the first time each demo account is created.
 */
if (process.env.NODE_ENV === "production" && process.env.SEED_CONFIRM !== "true") {
  console.error(
    "[seed] Refusing to run: NODE_ENV=production. This script creates demo " +
    "accounts (including a SUPER_ADMIN) and must never touch a production " +
    "database. If you really mean to do this, set SEED_CONFIRM=true."
  );
  process.exit(1);
}

function generateDemoPassword(): string {
  // Guarantee at least one upper/lower/digit (matches PASSWORD_REGEX) even
  // though the seed bypasses that check — the generated password should
  // still work if reused through the normal password-change flow.
  const rand = crypto.randomBytes(9).toString("base64url"); // 12 chars
  return `Aa1${rand}`;
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || generateDemoPassword();

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const units = [
    { code: "UNIGA", name: "Rektorat Universitas Gajayana" },
    { code: "YAS", name: "Yayasan Gajayana Malang" },
    { code: "FE", name: "Fakultas Ekonomi" },
    { code: "FH", name: "Fakultas Hukum" },
  ];
  for (const u of units) {
    await prisma.unit.upsert({
      where: { code: u.code },
      update: { name: u.name },
      create: { ...u },
    });
  }

  const letterTypes = [
    { code: "SK", name: "Surat Keputusan" },
    { code: "ST", name: "Surat Tugas" },
    { code: "SP", name: "Surat Pengantar" },
    { code: "UND", name: "Surat Undangan" },
    { code: "EDAR", name: "Surat Edaran" },
    { code: "UMUM", name: "Umum" },
  ];
  for (const lt of letterTypes) {
    await prisma.letterType.upsert({
      where: { code: lt.code },
      update: { name: lt.name },
      create: { ...lt },
    });
  }

  const unigaUnit = await prisma.unit.findUniqueOrThrow({ where: { code: "UNIGA" } });
  const yasUnit = await prisma.unit.findUniqueOrThrow({ where: { code: "YAS" } });

  const accounts: Array<{
    email: string;
    name: string;
    role: Role;
    unitId: string | null;
  }> = [
    {
      email: "superadmin@unigamalang.ac.id",
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      unitId: null,
    },
    {
      email: "admin.rektorat@unigamalang.ac.id",
      name: "Admin Rektorat",
      role: Role.ADMIN_UNIT,
      unitId: unigaUnit.id,
    },
    {
      email: "admin.yayasan@unigamalang.ac.id",
      name: "Admin Yayasan",
      role: Role.ADMIN_UNIT,
      unitId: yasUnit.id,
    },
    {
      email: "staff@unigamalang.ac.id",
      name: "Staf Rektorat",
      role: Role.USER,
      unitId: unigaUnit.id,
    },
  ];

  for (const a of accounts) {
    await prisma.user.upsert({
      where: { email: a.email },
      update: { name: a.name, role: a.role, unitId: a.unitId },
      create: { ...a, passwordHash },
    });
  }

  console.log(
    `Seeded ${units.length} units, ${letterTypes.length} letter types, ${accounts.length} accounts.`
  );
  if (!process.env.SEED_DEMO_PASSWORD) {
    console.log(
      `\nDemo password (generated, only shown once — save it now):\n  ${DEMO_PASSWORD}\n\n` +
      `Re-running this seed will NOT reset it for accounts that already exist.\n` +
      `To pin a known password instead, set SEED_DEMO_PASSWORD before running.\n`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
