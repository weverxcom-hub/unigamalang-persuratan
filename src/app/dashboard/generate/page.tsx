import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateForm } from "./generate-form";
import { toRoman } from "@/lib/utils";

export default async function GeneratePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();

  const visibleUnits =
    session.role === "SUPER_ADMIN"
      ? db.units
      : db.units.filter((u) => u.id === session.unitId);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Penomoran Surat Otomatis</h1>
        <p className="text-sm text-muted-foreground">
          Format: <code className="rounded bg-muted px-1.5 py-0.5">[No]/[Kode Unit]/[Jenis]/[Bulan Romawi]/[Tahun]</code>
          &nbsp;&mdash; contoh: <strong>001/UNIGA/SK/{toRoman(month)}/{year}</strong>. Nomor akan reset ke 001 setiap 1 Januari.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buat Nomor &amp; Arsipkan Surat</CardTitle>
          <CardDescription>
            {session.role === "USER"
              ? "Draf akan dikirim ke Admin Unit untuk disetujui sebelum terbit."
              : "Nomor akan langsung dialokasikan dan diarsipkan dalam status ISSUED."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateForm
            units={visibleUnits}
            letterTypes={db.letterTypes}
            defaultUnitId={session.unitId ?? visibleUnits[0]?.id ?? ""}
            isUser={session.role === "USER"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
