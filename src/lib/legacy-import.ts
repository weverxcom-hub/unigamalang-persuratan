import type { PrismaClient } from "@prisma/client";
import legacyRows from "../../prisma/legacy-data/sk-bp3m-1987-2026.json";

// Shared logic behind:
//   - prisma/ensure-legacy-units.ts / prisma/import-legacy-decrees.ts (CLI,
//     for local/dev use against whatever DATABASE_URL is in .env)
//   - POST /api/legacy-decrees/import (in-app trigger, for when nobody can
//     read the production DATABASE_URL — see that route's comment)
// Both call these same two functions so there's exactly one implementation
// to keep correct.

const UNIT_KODE_TO_CODE: Record<string, string> = {
  UNIGA: "UNIGA",
  YAYASAN: "YAS",
  FS: "FS",
  FT: "FT",
  FIK: "FIK",
  FEB: "FE",
  // P4KG intentionally omitted — no Unit mapping (defunct ad-hoc committee).
};

const LEGACY_UNITS = [
  { code: "FS", name: "Fakultas Sastra" },
  { code: "FT", name: "Fakultas Teknik" },
  { code: "FIK", name: "Fakultas Ilmu Komputer" },
];

type SourceRow = {
  noUrutAsli: number;
  tanggalIso: string | null;
  tanggalRaw: string;
  nomorSk: string;
  perihal: string;
  unitKode: string;
  unitLabel: string;
  sourceLink: string;
  catatan: string;
  lengkap: boolean;
};

const SENSITIVE_PERIHAL_PATTERNS = [
  /\bsaudara\s*:/i,
  /sanksi/i,
  /disiplin/i,
  /pelecehan/i,
  /skorsing/i,
  /pemberhentian/i,
  /pengunduran diri/i,
  /\bcuti\b/i,
  /ijin belajar/i,
  /izin belajar/i,
  /tugas belajar/i,
  /pemecatan/i,
  /pelanggaran/i,
];

function looksPersonalOrSensitive(perihal: string): boolean {
  return SENSITIVE_PERIHAL_PATTERNS.some((re) => re.test(perihal));
}

function detectLetterTypeCode(nomor: string): "SK" | "EDAR" {
  return /\bSE\b/i.test(nomor) ? "EDAR" : "SK";
}

export async function ensureLegacyUnits(prisma: PrismaClient) {
  const results: { code: string; id: string }[] = [];
  for (const u of LEGACY_UNITS) {
    const unit = await prisma.unit.upsert({
      where: { code: u.code },
      update: { name: u.name },
      create: { ...u },
    });
    results.push({ code: u.code, id: unit.id });
  }
  return results;
}

export async function importLegacyDecrees(prisma: PrismaClient) {
  const rows = legacyRows as SourceRow[];

  const [skType, edarType] = await Promise.all([
    prisma.letterType.findUnique({ where: { code: "SK" } }),
    prisma.letterType.findUnique({ where: { code: "EDAR" } }),
  ]);
  if (!skType || !edarType) {
    throw new Error(
      "LetterType SK dan/atau EDAR tidak ditemukan. Database ini sepertinya belum pernah " +
        "menjalankan seed dasar (unit/jenis surat) — impor SK legacy butuh itu lebih dulu."
    );
  }

  const unitCache = new Map<string, string | null>();
  for (const [unitKode, code] of Object.entries(UNIT_KODE_TO_CODE)) {
    const unit = await prisma.unit.findUnique({ where: { code } });
    if (!unit) {
      throw new Error(`Unit dengan kode "${code}" tidak ditemukan. Jalankan "Pastikan Unit" dulu.`);
    }
    unitCache.set(unitKode, unit.id);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const letterType = detectLetterTypeCode(row.nomorSk) === "EDAR" ? edarType : skType;
    const unitId = unitCache.get(row.unitKode) ?? null;

    if (!row.perihal || !row.unitLabel) {
      skipped++;
      continue;
    }

    const data = {
      tanggal: row.tanggalIso ? new Date(row.tanggalIso) : null,
      tanggalRaw: row.tanggalRaw,
      nomor: (row.nomorSk || "").trim(),
      perihal: row.perihal,
      letterTypeId: letterType.id,
      unitId,
      unitLabelRaw: row.unitLabel,
      sourceLink: row.sourceLink || null,
      catatan: row.catatan || null,
      isComplete: row.lengkap,
    };

    const existing = await prisma.legacyDecree.findUnique({ where: { noUrutAsli: row.noUrutAsli } });
    if (existing) {
      // isPublic is NOT included in the update — see prisma/import-legacy-decrees.ts
      // for why (must not clobber a manual admin review decision).
      await prisma.legacyDecree.update({ where: { noUrutAsli: row.noUrutAsli }, data });
      updated++;
    } else {
      await prisma.legacyDecree.create({
        data: { noUrutAsli: row.noUrutAsli, ...data, isPublic: !looksPersonalOrSensitive(row.perihal) },
      });
      created++;
    }
  }

  const hiddenCount = await prisma.legacyDecree.count({ where: { isPublic: false } });
  return { total: rows.length, created, updated, skipped, hiddenCount };
}
