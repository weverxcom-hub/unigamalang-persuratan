import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
