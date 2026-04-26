import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintShell } from "@/components/app/print-shell";

export const dynamic = "force-dynamic";

const roleLabel = (role: "SUPER_ADMIN" | "ADMIN_UNIT" | "USER") =>
  role === "SUPER_ADMIN" ? "Super Admin" : role === "ADMIN_UNIT" ? "Admin Unit" : "Pengguna";

export default async function PrintUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const [users, units] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.unit.findMany({ orderBy: { code: "asc" } }),
  ]);
  const unitNameById = new Map(units.map((u) => [u.id, `${u.code} — ${u.name}`]));

  return (
    <PrintShell
      title="Daftar Pengguna"
      subtitle="Akun aktif pada Sistem Persuratan unigamalang."
      meta={[
        { label: "Total", value: `${users.length} akun aktif` },
        { label: "Dicetak oleh", value: `${session.name} (${session.email})` },
      ]}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2 pr-2 w-12">No</th>
            <th className="py-2 pr-2">Nama</th>
            <th className="py-2 pr-2">Email</th>
            <th className="py-2 pr-2 w-32">Role</th>
            <th className="py-2 pr-2">Unit</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u.id} className="border-b border-neutral-300 align-top">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">{u.name}</td>
              <td className="py-1.5 pr-2 font-mono text-xs">{u.email}</td>
              <td className="py-1.5 pr-2">{roleLabel(u.role)}</td>
              <td className="py-1.5 pr-2 text-xs">
                {u.unitId ? unitNameById.get(u.unitId) ?? "—" : "—"}
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-neutral-500">
                Tidak ada data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </PrintShell>
  );
}
