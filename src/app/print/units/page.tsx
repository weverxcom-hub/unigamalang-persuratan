import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintShell } from "@/components/app/print-shell";

export const dynamic = "force-dynamic";

export default async function PrintUnitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const items = await prisma.unit.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
  });

  return (
    <PrintShell
      title="Daftar Unit"
      subtitle="Unit-unit aktif beserta template penomoran surat."
      meta={[
        { label: "Total", value: `${items.length} unit` },
        { label: "Dicetak oleh", value: `${session.name} (${session.email})` },
      ]}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2 pr-2 w-12">No</th>
            <th className="py-2 pr-2 w-28">Kode</th>
            <th className="py-2 pr-2">Nama Unit</th>
            <th className="py-2 pr-2">Template Nomor</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u, i) => (
            <tr key={u.id} className="border-b border-neutral-300 align-top">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2 font-mono">{u.code}</td>
              <td className="py-1.5 pr-2">{u.name}</td>
              <td className="py-1.5 pr-2 font-mono text-xs">{u.formatTemplate}</td>
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
