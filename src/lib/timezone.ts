// Institution timezone helpers.
//
// Vercel serverless functions run in UTC regardless of the `TZ` env var
// documented in .env.example (that var helps `toLocaleDateString()` calls
// that don't pass an explicit `timeZone`, but relying on ops to set it
// correctly is fragile — see audit B3, 2026-08-27). Anything that decides
// a *calendar date* that ends up on an official document (letter numbers,
// export dates, report default ranges) must compute it explicitly in
// Asia/Jakarta so results don't shift by a day/month/year depending on
// wall-clock UTC offset (WIB = UTC+7, so 00:00–06:59 WIB is still the
// previous UTC day).

export const JAKARTA_TZ = "Asia/Jakarta";

export interface JakartaParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

/** Decompose a Date into its Asia/Jakarta calendar year/month/day. */
export function getJakartaParts(date: Date = new Date()): JakartaParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** `YYYY-MM-DD` string for `date` in Asia/Jakarta — used for export/report
 *  columns where the reader expects "the day this happened, campus time". */
export function jakartaDateString(date: Date): string {
  const { year, month, day } = getJakartaParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
