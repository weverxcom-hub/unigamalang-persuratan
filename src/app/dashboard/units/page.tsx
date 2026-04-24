import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnitsClient } from "./units-client";

export default async function UnitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");
  const db = getDb();
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
          <CardDescription>Tambah unit baru dengan kode unik (mis. UNIGA, YAS).</CardDescription>
        </CardHeader>
        <CardContent>
          <UnitsClient initialUnits={db.units} />
        </CardContent>
      </Card>
    </div>
  );
}
