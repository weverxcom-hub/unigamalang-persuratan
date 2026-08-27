import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toRoman(month: number): string {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  return romans[month - 1] ?? "";
}

export function formatDate(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  // Explicit timeZone (audit B3) — don't rely on the server's TZ env var
  // being set correctly; without it this renders in UTC on Vercel.
  return d.toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}
