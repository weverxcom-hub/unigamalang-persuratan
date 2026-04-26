import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { AutoPrint } from "./auto-print";

interface Props {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  children: ReactNode;
}

/**
 * Print-friendly shell used by report/print pages. Renders the institutional
 * header, document title, optional metadata strip (filters/date range),
 * the list/table content, and a footer with timestamp.
 *
 * The page auto-triggers `window.print()` once mounted so users land
 * straight in the browser print dialog.
 */
export function PrintShell({ title, subtitle, meta, children }: Props) {
  const printedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="print-shell mx-auto max-w-[210mm] px-8 py-10 text-sm text-black">
      <AutoPrint />
      <header className="mb-6 flex items-start gap-4 border-b-2 border-black pb-4">
        <Logo size={56} />
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-neutral-700">
            Sistem Persuratan Universitas Gajayana
          </p>
          <h1 className="text-xl font-bold leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-neutral-600">{subtitle}</p>}
        </div>
        <div className="text-right text-xs text-neutral-700">
          <p>Dicetak</p>
          <p className="font-medium">{printedAt}</p>
        </div>
      </header>
      {meta && meta.length > 0 && (
        <div className="mb-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {meta.map((m) => (
            <div key={m.label} className="flex gap-2">
              <span className="text-neutral-600">{m.label}:</span>
              <span className="font-medium">{m.value}</span>
            </div>
          ))}
        </div>
      )}
      <main>{children}</main>
      <footer className="mt-8 border-t pt-3 text-[10px] text-neutral-500 print:fixed print:bottom-4 print:left-8 print:right-8">
        <p>
          Dokumen ini dihasilkan otomatis oleh Sistem Persuratan unigamalang. Verifikasi keabsahan
          data melalui aplikasi.
        </p>
      </footer>
    </div>
  );
}
