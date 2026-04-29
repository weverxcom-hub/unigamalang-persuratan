import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { PrintButton } from "./print-button";

/**
 * Printable receipt for INCOMING letters. Styled to A5 half-page with
 * print:break-inside-avoid semantics. Users open this directly in a new
 * tab and use the browser's "Print to PDF" to save a copy.
 */
export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { unit: true, letterType: true, createdBy: { select: { name: true } } },
  });
  if (!archive) notFound();

  if (
    session.role !== "SUPER_ADMIN" &&
    session.unitId !== archive.unitId
  ) {
    redirect("/dashboard");
  }

  const isIncoming = archive.direction === "INCOMING";
  const dateStr = formatDate(archive.date);
  const receivedAt = formatDate(archive.createdAt);

  return (
    <div className="mx-auto max-w-2xl bg-white text-zinc-900 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Tanda Terima Surat</h1>
        <PrintButton />
      </div>
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-zinc-200 pb-4">
          <div className="flex items-center gap-3">
            <Logo size={48} showWordmark={false} />
            <div>
              <div className="text-sm font-semibold">Universitas Gajayana</div>
              <div className="text-xs text-zinc-500">Sistem Manajemen Persuratan · unigamalang</div>
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <div>ID: <code>{archive.id}</code></div>
            <div>Diterima: {receivedAt}</div>
          </div>
        </div>

        <h2 className="mt-6 text-lg font-semibold tracking-tight">
          {isIncoming ? "TANDA TERIMA SURAT MASUK" : "TANDA TERIMA SURAT"}
        </h2>

        <table className="mt-4 w-full text-sm">
          <tbody>
            <tr>
              <td className="w-40 py-1 align-top text-zinc-500">Nomor Surat</td>
              <td className="py-1"><code className="rounded bg-zinc-100 px-2 py-0.5 font-mono">{archive.number}</code></td>
            </tr>
            <tr>
              <td className="py-1 align-top text-zinc-500">Tanggal Surat</td>
              <td className="py-1">{dateStr}</td>
            </tr>
            <tr>
              <td className="py-1 align-top text-zinc-500">Perihal</td>
              <td className="py-1">{archive.subject}</td>
            </tr>
            {isIncoming && (
              <tr>
                <td className="py-1 align-top text-zinc-500">Pengirim</td>
                <td className="py-1">{archive.externalSender ?? "-"}</td>
              </tr>
            )}
            <tr>
              <td className="py-1 align-top text-zinc-500">
                {isIncoming ? "Penerima" : "Tujuan"}
              </td>
              <td className="py-1">{archive.recipient}</td>
            </tr>
            <tr>
              <td className="py-1 align-top text-zinc-500">Unit</td>
              <td className="py-1">{archive.unit.name} ({archive.unit.code})</td>
            </tr>
            <tr>
              <td className="py-1 align-top text-zinc-500">Jenis Surat</td>
              <td className="py-1">{archive.letterType.name} ({archive.letterType.code})</td>
            </tr>
            <tr>
              <td className="py-1 align-top text-zinc-500">Dicatat oleh</td>
              <td className="py-1">{archive.createdBy.name}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-zinc-500">
          <div>
            <p className="mb-10">Petugas Pencatat,</p>
            <p className="border-t border-zinc-300 pt-1">({archive.createdBy.name})</p>
          </div>
          <div>
            <p className="mb-10">Pengirim / Kurir,</p>
            <p className="border-t border-zinc-300 pt-1">(__________________________)</p>
          </div>
        </div>

        <p className="mt-6 text-[10px] text-zinc-400">
          Dokumen ini dihasilkan otomatis oleh Sistem Persuratan Universitas Gajayana.
          Jika terdapat ketidaksesuaian data, segera hubungi administrator unit terkait.
        </p>
      </div>
    </div>
  );
}
