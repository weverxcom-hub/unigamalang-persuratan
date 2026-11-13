import { z } from "zod";

/** Longest catalog code is `UNIGA.FISB.IKOM` (15); 20 leaves room for one more level. */
export const UNIT_CODE_MAX = 20;

/**
 * Capital letters and digits, with a dot between hierarchy levels
 * (`UNIGA`, `UNIGA.FEB`, `UNIGA.FEB.MN`). No slash: the code is one segment
 * of a letter number, and segments are separated by `/`.
 */
export const UNIT_CODE_PATTERN = /^[A-Z0-9]+(\.[A-Z0-9]+)*$/;

export const unitCodeSchema = z
  .string()
  .min(2, "Kode minimal 2 karakter")
  .max(UNIT_CODE_MAX, `Kode maksimal ${UNIT_CODE_MAX} karakter`)
  .regex(
    UNIT_CODE_PATTERN,
    "Kode harus huruf kapital/angka, jenjang dipisah titik (mis. UNIGA, UNIGA.FEB.MN)"
  );
