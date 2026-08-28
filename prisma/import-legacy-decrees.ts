import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

/**
 * One-off import of the BP3M SK/SE recap (1987–2026, 325 rows) into
 * `LegacyDecree`. Source: prisma/legacy-data/sk-bp3m-1987-2026.json,
 * cleaned from github.com/rharisetiawan/sk-uniga's data/sk-seed.json
 * (query-string params stripped from sourceLink — they carried the
 * uploader's Google account id).
 *
 * Idempotent: upserts by `noUrutAsli` (unique), so re-running after fixing
 * a row in the source JSON just updates that row rather than duplicating.
 *
 * Unit mapping notes:
 *   - `unitKode` from the source is unreliable — many rows that are
 *     clearly about a specific fakultas (FISB, etc.) got recapped as
 *     generic "UNIGA" because the original cleaning script couldn't parse
 *     the unit out of every historical number format. We don't try to
 *     fix that here; unitLabelRaw preserves what the source said either
 *     way, so it can be corrected later via the admin UI without losing
 *     information.
 *   - "FEB" (Fakultas Ekonomi dan Bisnis, 2 rows) is mapped to the
 *     existing "FE" (Fakultas Ekonomi) unit — same fakultas, renamed at
 *     some point. Confirm with the university if a formal rename is
 *     needed; not done here since it'd touch a unit already used by live
 *     Archive rows.
 *   - "P4KG" (Panitia Pemilihan Rektor, 1 row, ad-hoc/defunct) is left
 *     unmapped (unitId = null) — not worth a permanent Unit row for a
 *     committee that no longer exists. unitLabelRaw keeps the original
 *     label.
 */

const UNIT_KODE_TO_CODE: Record<string, string> = {
  UNIGA: "UNIGA",
  YAYASAN: "YAS",
  FS: "FS",
  FT: "FT",
  FIK: "FIK",
  FEB: "FE",
  // P4KG intentionally omitted — no Unit mapping, see note above.
};

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

function detectLetterTypeCode(nomor: string): "SK" | "EDAR" {
  return /\bSE\b/i.test(nomor) ? "EDAR" : "SK";
}

// Deliberately broad keyword heuristic, not a precision classifier: this
// controls a public-safety default (see schema.prisma comment on
// LegacyDecree.isPublic), so false negatives (a sensitive row slipping
// through as public) are the failure mode to avoid. False positives (a
// harmless row hidden until BP3M manually reviews it) cost someone a
// lookup in the admin view — asymmetric on purpose. Audit trigger: row
// #324 in the source recap is a student sexual-harassment disciplinary
// sanction that was publicly linked before this existed.
const SENSITIVE_PERIHAL_PATTERNS = [
  /\bsaudara\s*:/i, // "... Saudara: <name>" — names an individual directly
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

async function main() {
  const filePath = path.join(__dirname, "legacy-data", "sk-bp3m-1987-2026.json");
  const rows: SourceRow[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  console.log(`[import-legacy-decrees] ${rows.length} rows loaded from ${filePath}`);

  // JSON.parse() returns `any`, so `SourceRow[]` above is an unchecked type
  // assertion — a key rename/typo in the source file (this happened once
  // already: sumberLink vs sourceLink, silently importing 325 nulls) would
  // otherwise pass straight through with no error. Spot-check the first row
  // actually has every expected key before trusting the rest.
  const expectedKeys: (keyof SourceRow)[] = [
    "noUrutAsli", "tanggalRaw", "nomorSk", "perihal", "unitKode",
    "unitLabel", "sourceLink", "catatan", "lengkap",
  ];
  const missingKeys = expectedKeys.filter((k) => !(k in (rows[0] ?? {})));
  if (rows.length === 0 || missingKeys.length > 0) {
    throw new Error(
      `[import-legacy-decrees] Source JSON shape mismatch — missing key(s): ${missingKeys.join(", ")}. ` +
        `Refusing to import (would silently write nulls for every row).`
    );
  }

  const [skType, edarType] = await Promise.all([
    prisma.letterType.findUniqueOrThrow({ where: { code: "SK" } }),
    prisma.letterType.findUniqueOrThrow({ where: { code: "EDAR" } }),
  ]);

  const unitCache = new Map<string, string | null>(); // unitKode -> Unit.id | null
  for (const [unitKode, code] of Object.entries(UNIT_KODE_TO_CODE)) {
    const unit = await prisma.unit.findUnique({ where: { code } });
    if (!unit) {
      throw new Error(
        `[import-legacy-decrees] Unit with code "${code}" not found — run ` +
          `"npm run db:seed" first (it now includes FS/FT/FIK).`
      );
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
      console.warn(`[import-legacy-decrees] Skipping row ${row.noUrutAsli}: missing perihal/unitLabel`);
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
      // isPublic is intentionally NOT included in the update — once BP3M
      // has manually reviewed a row via the admin UI and set isPublic
      // explicitly, a re-run of this script (e.g. after fixing a typo in
      // perihal) must not silently recompute and overwrite that human
      // judgment call from the keyword heuristic.
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
  console.log(
    `[import-legacy-decrees] Done. created=${created} updated=${updated} skipped=${skipped} ` +
      `(${hiddenCount} row(s) currently isPublic=false — review via admin UI once it exists; ` +
      `for now, flip manually in the DB after reading sourceLink)`
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
