import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintShell } from "@/components/app/print-shell";

export const dynamic = "force-dynamic";

interface SearchParams {
  unitId?: string;
  letterTypeId?: string;
  direction?: string;
  status?: string;
  q?: string;
  year?: string;
  dateFrom?: string;
  dateTo?: string;
}

const directionLabel = (d: "OUTGOING" | "INCOMING") => (d === "OUTGOING" ? "Keluar" : "Masuk");

export default async function PrintArchivesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const where: Prisma.ArchiveWhereInput = { deletedAt: null };
  if (session.role !== "SUPER_ADMIN") {
    where.unitId = session.unitId ?? "__no_unit__";
  } else if (searchParams.unitId) {
    where.unitId = searchParams.unitId;
  }
  if (searchParams.letterTypeId) where.letterTypeId = searchParams.letterTypeId;
  if (searchParams.direction === "OUTGOING" || searchParams.direction === "INCOMING") {
    where.direction = searchParams.direction;
  }
  if (searchParams.status) {
    where.status = searchParams.status as Prisma.ArchiveWhereInput["status"];
  }
  if (searchParams.q) {
    const tokens = searchParams.q.split(/\s+/).filter(Boolean);
    where.AND = tokens.map((t) => ({
      OR: [
        { number: { contains: t, mode: "insensitive" } },
        { subject: { contains: t, mode: "insensitive" } },
        { recipient: { contains: t, mode: "insensitive" } },
        { externalSender: { contains: t, mode: "insensitive" } },
      ],
    }));
  }
  const dateFilter: Prisma.DateTimeFilter = {};
  if (searchParams.dateFrom) {
    const d = new Date(searchParams.dateFrom);
    if (!Number.isNaN(d.getTime())) dateFilter.gte = d;
  }
  if (searchParams.dateTo) {
    const d = new Date(searchParams.dateTo);
    if (!Number.isNaN(d.getTime())) {
      d.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }
  }
  if (!searchParams.dateFrom && !searchParams.dateTo && searchParams.year) {
    const y = Number(searchParams.year);
    if (!Number.isNaN(y)) {
      dateFilter.gte = new Date(Date.UTC(y, 0, 1));
      dateFilter.lt = new Date(Date.UTC(y + 1, 0, 1));
    }
  }
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

  const [archives, units, letterTypes] = await Promise.all([
    prisma.archive.findMany({ where, orderBy: { date: "desc" }, take: 1000 }),
    prisma.unit.findMany(),
    prisma.letterType.findMany(),
  ]);
  const unitName = new Map(units.map((u) => [u.id, `${u.code} — ${u.name}`]));
  const letterTypeName = new Map(letterTypes.map((lt) => [lt.id, `${lt.code} — ${lt.name}`]));

  const meta: { label: string; value: string }[] = [
    { label: "Total", value: `${archives.length} arsip` },
    { label: "Dicetak oleh", value: `${session.name} (${session.email})` },
  ];
  if (searchParams.direction) meta.push({ label: "Arah", value: searchParams.direction });
  if (searchParams.status) meta.push({ label: "Status", value: searchParams.status });
  if (searchParams.unitId && unitName.has(searchParams.unitId)) {
    meta.push({ label: "Unit", value: unitName.get(searchParams.unitId)! });
  }
  if (searchParams.letterTypeId && letterTypeName.has(searchParams.letterTypeId)) {
    meta.push({ label: "Jenis", value: letterTypeName.get(searchParams.letterTypeId)! });
  }
  if (searchParams.dateFrom) meta.push({ label: "Dari", value: searchParams.dateFrom });
  if (searchParams.dateTo) meta.push({ label: "Sampai", value: searchParams.dateTo });
  if (searchParams.year && !searchParams.dateFrom && !searchParams.dateTo) {
    meta.push({ label: "Tahun", value: searchParams.year });
  }
  if (searchParams.q) meta.push({ label: "Pencarian", value: searchParams.q });

  return (
    <PrintShell title="Daftar Arsip Surat" meta={meta}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2 pr-2 w-10">No</th>
            <th className="py-2 pr-2 w-24">Tanggal</th>
            <th className="py-2 pr-2 w-16">Arah</th>
            <th className="py-2 pr-2 w-44">Nomor</th>
            <th className="py-2 pr-2">Perihal</th>
            <th className="py-2 pr-2">Pengirim/Tujuan</th>
            <th className="py-2 pr-2 w-24">Status</th>
          </tr>
        </thead>
        <tbody>
          {archives.map((a, i) => {
            const senderOrTarget =
              a.direction === "INCOMING"
                ? a.externalSender || a.recipient
                : a.recipient;
            return (
              <tr key={a.id} className="border-b border-neutral-300 align-top">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  {a.date.toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="py-1.5 pr-2">{directionLabel(a.direction)}</td>
                <td className="py-1.5 pr-2 font-mono">{a.number}</td>
                <td className="py-1.5 pr-2">{a.subject}</td>
                <td className="py-1.5 pr-2">{senderOrTarget}</td>
                <td className="py-1.5 pr-2">{a.status}</td>
              </tr>
            );
          })}
          {archives.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-neutral-500">
                Tidak ada arsip yang cocok dengan filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </PrintShell>
  );
}
