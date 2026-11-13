import { renderFormat } from "@/lib/format";

/**
 * Target data for the 2027 numbering rule (see
 * docs/superpowers/specs/2026-11-13-aturan-penomoran-2027-design.md).
 *
 * `aliases` are codes an existing database row may carry today for the same
 * thing; the planner renames such a row instead of creating a duplicate.
 */
export interface CatalogEntry {
  code: string;
  name: string;
  aliases: string[];
}

export const TEMPLATE_2027 = "[SEQ]/[UNIT_CODE]/[TYPE_CODE]/[YEAR]";

const UNIT_PREFIX = "UNIGA.";

// A unit is recognised by its code without the UNIGA. prefix when that bare
// code has no dot (FEB -> UNIGA.FEB). Dotted codes (prodi, UPM) could not
// exist before dots were allowed, so they have no alias.
function unit(code: string, name: string): CatalogEntry {
  const bare = code.startsWith(UNIT_PREFIX) ? code.slice(UNIT_PREFIX.length) : "";
  return { code, name, aliases: bare && !bare.includes(".") ? [bare] : [] };
}

export const UNITS_2027: CatalogEntry[] = [
  unit("UNIGA", "Rektor"),
  unit("UNIGA.WR1", "Wakil Rektor I"),
  unit("UNIGA.WR2", "Wakil Rektor II"),
  unit("UNIGA.BAU", "Biro Administrasi Umum"),
  unit("UNIGA.BAA", "Biro Administrasi Akademik"),
  unit("UNIGA.LPPM", "Lembaga Penelitian dan Pengabdian kepada Masyarakat"),
  unit("UNIGA.BP3M", "Badan Pengembangan Pendidikan dan Penjaminan Mutu"),
  unit("UNIGA.PPS", "Pascasarjana"),
  unit("UNIGA.PPS.DIM", "Program Studi Doktor Ilmu Manajemen"),
  unit("UNIGA.PPS.MM", "Program Studi Magister Manajemen"),
  unit("UNIGA.PPS.MAK", "Program Studi Magister Akuntansi"),
  unit("UNIGA.PPS.UPM", "UPM Pascasarjana"),
  unit("UNIGA.FEB", "Fakultas Ekonomi dan Bisnis"),
  unit("UNIGA.FEB.AK", "Program Studi Akuntansi"),
  unit("UNIGA.FEB.EP", "Program Studi Ekonomi Pembangunan"),
  unit("UNIGA.FEB.MN", "Program Studi Manajemen"),
  unit("UNIGA.FEB.UPM", "UPM FEB"),
  unit("UNIGA.FTI", "Fakultas Teknik dan Informatika"),
  unit("UNIGA.FTI.SI", "Program Studi Sistem Informasi"),
  unit("UNIGA.FTI.TE", "Program Studi Teknik Elektro"),
  unit("UNIGA.FTI.TM", "Program Studi Teknik Mesin"),
  unit("UNIGA.FTI.TI", "Program Studi Teknik Industri"),
  unit("UNIGA.FTI.UPM", "UPM FTI"),
  unit("UNIGA.FISB", "Fakultas Ilmu Sosial dan Budaya"),
  unit("UNIGA.FISB.BI", "Program Studi Bahasa Inggris"),
  unit("UNIGA.FISB.PSI", "Program Studi Psikologi"),
  unit("UNIGA.FISB.IKOM", "Program Studi Ilmu Komunikasi"),
  unit("UNIGA.FISB.UPM", "UPM FISB"),
  unit("UNIGA.LSP", "Lembaga Sertifikasi Profesi"),
  unit("UNIGA.DIVMA", "DIVMA"),
  unit("UNIGA.PPSDM", "PPSDM"),
  unit("UNIGA.JPC", "Job Placement Center"),
  unit("UNIGA.PUS", "Perpustakaan"),
  unit("UNIGA.KKI", "Kantor Kerja Sama Internasional"),
  unit("UNIGA.PTI", "Pusat Teknologi Informasi"),
  unit("UNIGA.P2K2", "Pusat Penempatan Kerja dan Pengembangan Karier"),
  unit("UNIGA.UBIS", "Unit Bisnis"),
  unit("UNIGA.TAX", "Tax Center"),
  unit("UNIGA.HUMAS", "Hubungan Masyarakat"),
  unit("UNIGA.PUBL", "Publikasi"),
];

const type = (code: string, name: string, aliases: string[] = []): CatalogEntry => ({
  code,
  name,
  aliases,
});

export const LETTER_TYPES_2027: CatalogEntry[] = [
  type("SK", "Keputusan"),
  type("ST", "Surat Tugas"),
  type("SE", "Surat Edaran", ["EDAR"]),
  type("SU", "Surat Undangan", ["UND"]),
  type("SP", "Surat Pengantar"),
  type("ND", "Nota Dinas"),
  type("SD", "Surat Dinas", ["UMUM"]),
  type("SPR", "Surat Perintah"),
  type("SKET", "Surat Keterangan"),
  type("SPN", "Surat Pernyataan"),
  type("SKU", "Surat Kuasa"),
  type("BA", "Berita Acara"),
  type("PGM", "Pengumuman"),
  type("PKS", "Perjanjian Kerja Sama"),
  type("MEMO", "Memorandum"),
  type("SOP", "Prosedur Operasional Standar"),
  type("PER", "Peraturan Rektor"),
  type("NTL", "Notula"),
  type("LAP", "Laporan"),
  type("TS", "Telaah Staf"),
];

/**
 * Codes a letter type may carry before or after the rule is applied, 2027
 * code first. For lookups that must work in both states.
 */
export function letterTypeCodeCandidates(code: string): string[] {
  const entry = LETTER_TYPES_2027.find((t) => t.code === code);
  return entry ? [entry.code, ...entry.aliases] : [code];
}

const EXAMPLES = [
  { sequence: 12, unitCode: "UNIGA.WR1", letterTypeCode: "ST" },
  { sequence: 34, unitCode: "UNIGA", letterTypeCode: "SK" },
  { sequence: 112, unitCode: "UNIGA.FEB.MN", letterTypeCode: "SKET" },
];

/** Three sample numbers showing what `template` produces. */
export function exampleNumbers(template: string, year: number): string[] {
  return EXAMPLES.map((e) => renderFormat(template, { ...e, month: 1, year }));
}
