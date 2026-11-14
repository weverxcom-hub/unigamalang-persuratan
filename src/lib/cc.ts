import type { Prisma } from "@prisma/client";

/** Batas jumlah unit tembusan per surat (cegah payload berlebihan). */
export const MAX_CC_UNITS = 50;

/**
 * Unit tembusan hanya melihat surat yang sudah resmi terbit (ISSUED, ada
 * bukti). Draf, nomor tentatif, VOID, dan PENDING_PROOF belum final sehingga
 * tidak dibocorkan ke unit lain.
 */
export function ccReadableWhere(unitId: string): Prisma.ArchiveWhereInput {
  return { status: "ISSUED", ccUnits: { some: { unitId } } };
}

/** Rapikan daftar id unit tembusan: dedupe, buang unit penerbit & string kosong. */
export function normaliseCcUnitIds(
  ids: readonly string[] | null | undefined,
  issuingUnitId: string
): string[] {
  const out = new Set<string>();
  for (const raw of ids ?? []) {
    const id = raw.trim();
    if (id && id !== issuingUnitId) out.add(id);
  }
  return Array.from(out);
}
