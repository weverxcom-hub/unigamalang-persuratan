import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintShell } from "@/components/app/print-shell";

export const dynamic = "force-dynamic";

export default async function PrintLetterTypesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const items = await prisma.letterType.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
  });

  return (
    <PrintShell
      title="Daftar Jenis Surat"
      subtitle="Kode dan nama jenis surat yang aktif digunakan untuk penomoran."
      meta={[
        { label: "Total", value: `${items.length} jenis surat` },
        { label: "Dicetak oleh", value: `${session.name} (${session.email})` },
      ]}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2 pr-2 w-12">No</th>
            <th className="py-2 pr-2 w-32">Kode</th>
            <th className="py-2 pr-2">Nama Jenis Surat</th>
            <th className="py-2 pr-2 w-40">Dibuat</th>
          </tr>
        </thead>
        <tbody>
          {items.map((lt, i) => (
            <tr key={lt.id} className="border-b border-neutral-300 align-top">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2 font-mono">{lt.code}</td>
              <td className="py-1.5 pr-2">{lt.name}</td>
              <td className="py-1.5 pr-2 text-xs text-neutral-700">
                {lt.createdAt.toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-neutral-500">
                Tidak ada data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </PrintShell>
  );
}
