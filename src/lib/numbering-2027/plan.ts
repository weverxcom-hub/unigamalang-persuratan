import { LETTER_TYPES_2027, UNITS_2027, type CatalogEntry } from "./catalog";

/** A Unit or LetterType row as it exists today. `formatTemplate` is units only. */
export interface ExistingRow {
  id: string;
  code: string;
  name: string;
  deletedAt: Date | null;
  formatTemplate?: string;
}

export interface PlanStep {
  action: "create" | "update" | "unchanged";
  /** Code after the step. */
  code: string;
  /** Name after the step. */
  name: string;
  /** Existing row, for update and unchanged. */
  id?: string;
  /** Existing code, when the step renames it. */
  fromCode?: string;
  reactivate?: boolean;
}

interface Untouched {
  id: string;
  code: string;
  name: string;
}

export interface ApplyPlan {
  template: string;
  units: PlanStep[];
  letterTypes: PlanStep[];
  /** Active rows the catalog does not know. Never modified. */
  untouchedUnits: Untouched[];
  untouchedLetterTypes: Untouched[];
}

/**
 * Diff the catalog against existing rows. `template` is passed for units and
 * omitted for letter types, which have no template to compare.
 *
 * A row already carrying the target code wins over a row carrying an alias,
 * so a half-migrated database never gets two rows renamed onto one code.
 */
function planRows(
  catalog: CatalogEntry[],
  existing: ExistingRow[],
  template?: string
): { steps: PlanStep[]; untouched: Untouched[] } {
  const claimed = new Set<string>();
  const exactMatches = new Map<string, ExistingRow>();
  for (const entry of catalog) {
    const row = existing.find((r) => r.code === entry.code);
    if (row) {
      exactMatches.set(entry.code, row);
      claimed.add(row.id);
    }
  }

  const steps = catalog.map((entry): PlanStep => {
    const exact = exactMatches.get(entry.code);
    if (exact) {
      const upToDate =
        !exact.deletedAt && (template === undefined || exact.formatTemplate === template);
      return {
        action: upToDate ? "unchanged" : "update",
        code: entry.code,
        name: exact.name,
        id: exact.id,
        ...(exact.deletedAt ? { reactivate: true } : {}),
      };
    }
    const viaAlias = existing.find((r) => !claimed.has(r.id) && entry.aliases.includes(r.code));
    if (viaAlias) {
      claimed.add(viaAlias.id);
      return {
        action: "update",
        code: entry.code,
        name: entry.name,
        id: viaAlias.id,
        fromCode: viaAlias.code,
        ...(viaAlias.deletedAt ? { reactivate: true } : {}),
      };
    }
    return { action: "create", code: entry.code, name: entry.name };
  });

  const untouched = existing
    .filter((r) => !claimed.has(r.id) && !r.deletedAt)
    .map(({ id, code, name }) => ({ id, code, name }));

  return { steps, untouched };
}

export function planApply(input: {
  units: ExistingRow[];
  letterTypes: ExistingRow[];
  template: string;
}): ApplyPlan {
  const units = planRows(UNITS_2027, input.units, input.template);
  const letterTypes = planRows(LETTER_TYPES_2027, input.letterTypes);
  return {
    template: input.template,
    units: units.steps,
    letterTypes: letterTypes.steps,
    untouchedUnits: units.untouched,
    untouchedLetterTypes: letterTypes.untouched,
  };
}
