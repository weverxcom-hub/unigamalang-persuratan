import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnitsClient } from "./units-client";

export default async function UnitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");
  const [activeRaw, inactiveRaw] = await Promise.all([
    prisma.unit.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.unit.findMany({ where: { deletedAt: { not: null } }, orderBy: { code: "asc" } }),
  ]);
  const toDto = (u: typeof activeRaw[number]) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    formatTemplate: u.formatTemplate,
    createdAt: u.createdAt.toISOString(),
  });
  const units = activeRaw.map(toDto);
  const inactiveUnits = inactiveRaw.map(toDto);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manajemen Unit</h1>
        <p className="text-sm text-muted-foreground">
          Kelola unit-unit unigamalang dan kode unitnya. Kode unit digunakan dalam format nomor surat.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daftar Unit</CardTitle>
          <CardDescription>
            Tambah unit baru dengan kode unik (mis. UNIGA, YAS). Setiap unit dapat memiliki template
            nomor surat sendiri. Tombol &quot;Atur No.&quot; membuka editor counter per jenis surat
            untuk tahun berjalan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnitsClient initialUnits={units} initialInactive={inactiveUnits} />
        </CardContent>
      </Card>
    </div>
  );
}
