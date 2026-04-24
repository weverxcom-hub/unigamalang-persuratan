import { prisma } from "./prisma";
import { renderFormat } from "./format";
import type { Prisma } from "@prisma/client";

export interface GeneratedNumber {
  number: string;
  sequenceNumber: number;
  year: number;
  month: number;
  unitCode: string;
  letterTypeCode: string;
  unitFormatTemplate: string;
}

/**
 * Allocate the next sequence number for `(unitId, year)` atomically.
 *
 *   - Sequence is scoped per-unit-per-year (all letter types share the
 *     counter for a given unit + year), with the year resetting on 1 Jan.
 *   - Uses `upsert` + `increment` inside a Prisma transaction so concurrent
 *     calls never produce duplicate numbers.
 *   - The final string is rendered through the unit's `formatTemplate`.
 *
 * Pass an optional transactional client when this is called from inside an
 * existing `prisma.$transaction(async tx => ...)` block; otherwise a new
 * transaction is opened automatically.
 */
export async function allocateNextNumber(
  unitId: string,
  letterTypeId: string,
  tx?: Prisma.TransactionClient
): Promise<GeneratedNumber> {
  const client = tx ?? prisma;
  const run = async (c: Prisma.TransactionClient) => {
    const [unit, letterType] = await Promise.all([
      c.unit.findUnique({ where: { id: unitId } }),
      c.letterType.findUnique({ where: { id: letterTypeId } }),
    ]);
    if (!unit) throw new Error("Unit tidak ditemukan");
    if (!letterType) throw new Error("Jenis surat tidak ditemukan");

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Atomic increment: either create (last=1) or bump existing row by 1.
    const seq = await c.numberingSequence.upsert({
      where: { unitId_year: { unitId, year } },
      create: { unitId, year, last: 1 },
      update: { last: { increment: 1 } },
    });
    const sequence = seq.last;

    return {
      number: renderFormat(unit.formatTemplate, {
        sequence,
        unitCode: unit.code,
        letterTypeCode: letterType.code,
        month,
        year,
      }),
      sequenceNumber: sequence,
      year,
      month,
      unitCode: unit.code,
      letterTypeCode: letterType.code,
      unitFormatTemplate: unit.formatTemplate,
    } satisfies GeneratedNumber;
  };

  if (tx) return run(client as Prisma.TransactionClient);
  return prisma.$transaction(run);
}

/**
 * Non-mutating preview of what `allocateNextNumber` would produce. The
 * sequence table is NOT touched.
 */
export async function previewNextNumber(
  unitId: string,
  letterTypeId: string
): Promise<GeneratedNumber | null> {
  const [unit, letterType, seq] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId } }),
    prisma.letterType.findUnique({ where: { id: letterTypeId } }),
    (async () => {
      const year = new Date().getFullYear();
      return prisma.numberingSequence.findUnique({
        where: { unitId_year: { unitId, year } },
      });
    })(),
  ]);
  if (!unit || !letterType) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const sequence = (seq?.last ?? 0) + 1;

  return {
    number: renderFormat(unit.formatTemplate, {
      sequence,
      unitCode: unit.code,
      letterTypeCode: letterType.code,
      month,
      year,
    }),
    sequenceNumber: sequence,
    year,
    month,
    unitCode: unit.code,
    letterTypeCode: letterType.code,
    unitFormatTemplate: unit.formatTemplate,
  };
}
