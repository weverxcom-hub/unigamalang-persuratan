import { getDb, saveDb, uid } from "./db";
import { pad3, toRoman } from "./utils";
import type { NumberingSequence } from "./types";

export interface GeneratedNumber {
  number: string;
  sequenceNumber: number;
  year: number;
  month: number;
  unitCode: string;
  letterTypeCode: string;
}

/**
 * Allocates the next sequence number for (unit, letterType, year) combination.
 * Sequence resets to 1 at the start of each calendar year.
 */
export function allocateNextNumber(unitId: string, letterTypeId: string): GeneratedNumber {
  const db = getDb();
  const unit = db.units.find((u) => u.id === unitId);
  const letterType = db.letterTypes.find((lt) => lt.id === letterTypeId);
  if (!unit) throw new Error("Unit tidak ditemukan");
  if (!letterType) throw new Error("Jenis surat tidak ditemukan");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const seqId = `${unitId}:${letterTypeId}:${year}`;

  let seq: NumberingSequence | undefined = db.sequences.find((s) => s.id === seqId);
  if (!seq) {
    seq = { id: seqId, unitId, letterTypeId, year, lastNumber: 0 };
    db.sequences.push(seq);
  }
  seq.lastNumber += 1;

  const nextNumber = seq.lastNumber;
  const formatted = `${pad3(nextNumber)}/${unit.code}/${letterType.code}/${toRoman(month)}/${year}`;

  saveDb(db);

  return {
    number: formatted,
    sequenceNumber: nextNumber,
    year,
    month,
    unitCode: unit.code,
    letterTypeCode: letterType.code,
  };
}

/** Preview the next number without allocating it (does not mutate DB). */
export function previewNextNumber(unitId: string, letterTypeId: string): GeneratedNumber | null {
  const db = getDb();
  const unit = db.units.find((u) => u.id === unitId);
  const letterType = db.letterTypes.find((lt) => lt.id === letterTypeId);
  if (!unit || !letterType) return null;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const seqId = `${unitId}:${letterTypeId}:${year}`;
  const seq = db.sequences.find((s) => s.id === seqId);
  const next = (seq?.lastNumber ?? 0) + 1;
  return {
    number: `${pad3(next)}/${unit.code}/${letterType.code}/${toRoman(month)}/${year}`,
    sequenceNumber: next,
    year,
    month,
    unitCode: unit.code,
    letterTypeCode: letterType.code,
  };
}

export function newArchiveId() {
  return uid("arc");
}
