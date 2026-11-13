import { PrismaClient, Role, type ArchiveStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { allocateNextNumber } from "../src/lib/numbering";
import { TEMPLATE_2027 } from "../src/lib/numbering-2027/catalog";
import { applyNumberingRule } from "../src/lib/numbering-2027/apply-rule";

/**
 * Demo data for presenting the 2027 numbering rule. Run AFTER `npm run db:seed`
 * on a database made for the demo:
 *
 *   DEMO_SEED_CONFIRM=demo SEED_DEMO_PASSWORD=... npm run db:seed-demo
 *
 * 1. Issues a few letters in the current (legacy) format, so the demo shows
 *    old numbers staying valid.
 * 2. Applies the 2027 rule, exactly as the "Terapkan" button does.
 * 3. Adds one account per demo role and letters in the new format, so
 *    Wakil Rektor I and II letters can be told apart.
 *
 * Safe to re-run: it stops at step 1 and 3 when their letters already exist,
 * and applying the rule twice changes nothing. Refuses to touch a database
 * that looks like real data (more than 50 letters) or a production env.
 */

const prisma = new PrismaClient();
const MARK = "Contoh demo:";
const MAX_EXISTING_ARCHIVES = 50;

const DEMO_ACCOUNTS: { email: string; name: string; role: Role; unitCode: string }[] = [
  { email: "admin.wr1@unigamalang.ac.id", name: "Admin Wakil Rektor I", role: Role.ADMIN_UNIT, unitCode: "UNIGA.WR1" },
  { email: "admin.wr2@unigamalang.ac.id", name: "Admin Wakil Rektor II", role: Role.ADMIN_UNIT, unitCode: "UNIGA.WR2" },
  { email: "admin.bau@unigamalang.ac.id", name: "Admin BAU", role: Role.ADMIN_UNIT, unitCode: "UNIGA.BAU" },
  { email: "admin.feb@unigamalang.ac.id", name: "Admin FEB", role: Role.ADMIN_UNIT, unitCode: "UNIGA.FEB" },
  { email: "admin.feb.mn@unigamalang.ac.id", name: "Admin Prodi Manajemen", role: Role.ADMIN_UNIT, unitCode: "UNIGA.FEB.MN" },
  { email: "staf.feb@unigamalang.ac.id", name: "Staf FEB", role: Role.USER, unitCode: "UNIGA.FEB" },
];

type Letter = [unitCode: string, typeCode: string, subject: string, recipient: string, status: ArchiveStatus];

const LEGACY_LETTERS: Letter[] = [
  ["UNIGA", "ST", "Surat tugas panitia wisuda", "Panitia wisuda", "ISSUED"],
  ["UNIGA", "ST", "Surat tugas rapat koordinasi WR I", "Wakil Rektor I", "ISSUED"],
  ["UNIGA", "ST", "Surat tugas kunjungan mitra WR II", "Wakil Rektor II", "ISSUED"],
  ["UNIGA", "SK", "Pengangkatan panitia penerimaan mahasiswa baru", "Panitia PMB", "ISSUED"],
];

const NEW_LETTERS: Letter[] = [
  ["UNIGA.WR1", "ST", "Surat tugas rapat koordinasi akademik", "Para Dekan", "ISSUED"],
  ["UNIGA.WR1", "ST", "Surat tugas pendampingan akreditasi", "Tim akreditasi", "PENDING_PROOF"],
  ["UNIGA.WR2", "ST", "Surat tugas kunjungan mitra industri", "Tim kerja sama", "ISSUED"],
  ["UNIGA", "SU", "Undangan rapat koordinasi pimpinan", "Pimpinan unit", "ISSUED"],
  ["UNIGA", "SK", "Pengangkatan dosen tetap", "Dosen bersangkutan", "ISSUED"],
  ["UNIGA", "SE", "Edaran libur akhir tahun", "Seluruh sivitas", "ISSUED"],
  ["UNIGA.BAU", "ND", "Pengajuan honor narasumber", "Kepala BAU", "PENDING_PROOF"],
  ["UNIGA.FEB", "SK", "Penetapan pembimbing skripsi", "Dosen pembimbing", "ISSUED"],
  ["UNIGA.FEB.MN", "SKET", "Keterangan mahasiswa aktif", "Mahasiswa", "ISSUED"],
  ["UNIGA.FEB.MN", "SKET", "Keterangan mahasiswa aktif", "Mahasiswa", "PENDING_PROOF"],
];

async function issue(letters: Letter[], createdById: string) {
  for (const [unitCode, typeCode, subject, recipient, status] of letters) {
    const [unit, letterType] = await Promise.all([
      prisma.unit.findUniqueOrThrow({ where: { code: unitCode } }),
      prisma.letterType.findUniqueOrThrow({ where: { code: typeCode } }),
    ]);
    const archive = await prisma.$transaction(async (tx) => {
      const allocated = await allocateNextNumber(unit.id, letterType.id, tx);
      return tx.archive.create({
        data: {
          number: allocated.number,
          subject: `${MARK} ${subject}`,
          recipient,
          direction: "OUTGOING",
          status,
          unitId: unit.id,
          unitCode: unit.code,
          letterTypeId: letterType.id,
          letterTypeCode: letterType.code,
          sequenceNumber: allocated.sequenceNumber,
          createdById,
        },
      });
    });
    console.log(`  ${archive.number}  ${subject}`);
  }
}

async function main() {
  if (process.env.DEMO_SEED_CONFIRM !== "demo") {
    throw new Error("Set DEMO_SEED_CONFIRM=demo to confirm this database is a demo database.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run with NODE_ENV=production.");
  }
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) {
    throw new Error("Set SEED_DEMO_PASSWORD (the password for every demo account).");
  }

  const realLetters = await prisma.archive.count({ where: { subject: { not: { startsWith: MARK } } } });
  if (realLetters > MAX_EXISTING_ARCHIVES) {
    throw new Error(
      `This database already has ${realLetters} letters that are not demo letters. ` +
        "It looks like real data; seed-demo only runs on a database made for the demo."
    );
  }

  const superAdmin = await prisma.user.findUnique({ where: { email: "superadmin@unigamalang.ac.id" } });
  if (!superAdmin) throw new Error('Run "npm run db:seed" first (no superadmin account found).');

  const policy = await prisma.numberingPolicy.findUnique({ where: { id: 1 } });
  const demoLetters = await prisma.archive.count({ where: { subject: { startsWith: MARK } } });

  if (!policy && demoLetters === 0) {
    console.log("1. Letters in the current format:");
    await issue(LEGACY_LETTERS, superAdmin.id);
  } else {
    console.log("1. Skipped: legacy-format demo letters already exist or the rule was applied.");
  }

  console.log("2. Applying the 2027 numbering rule...");
  const result = await applyNumberingRule(prisma, policy?.template ?? TEMPLATE_2027, {
    userId: superAdmin.id,
    email: superAdmin.email,
  });
  console.log(`   ${JSON.stringify(result.summary)}`);
  console.log(`   untouched units: ${result.plan.untouchedUnits.map((u) => u.code).join(", ") || "-"}`);

  console.log("3. Demo accounts:");
  const passwordHash = await bcrypt.hash(password, 10);
  for (const account of DEMO_ACCOUNTS) {
    const unit = await prisma.unit.findUniqueOrThrow({ where: { code: account.unitCode } });
    await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name, role: account.role, unitId: unit.id, deletedAt: null },
      create: { email: account.email, name: account.name, role: account.role, unitId: unit.id, passwordHash },
    });
    console.log(`   ${account.email}  (${account.role}, ${account.unitCode})`);
  }

  const newFormatDemo = await prisma.archive.count({
    where: { subject: { startsWith: MARK }, unitCode: { startsWith: "UNIGA." } },
  });
  if (newFormatDemo === 0) {
    console.log("   Letters in the new format:");
    await issue(NEW_LETTERS, superAdmin.id);
  } else {
    console.log("   Skipped: new-format demo letters already exist.");
  }

  console.log("\nDone. Every demo account uses SEED_DEMO_PASSWORD.");
}

main()
  .catch((err) => {
    console.error("[seed-demo] Failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
