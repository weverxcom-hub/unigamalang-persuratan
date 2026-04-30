import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DispositionsClient } from "./dispositions-client";

export default async function DispositionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Disposisi</h1>
        <p className="text-sm text-muted-foreground">
          Kotak masuk dan kotak keluar disposisi surat. Tindak lanjuti instruksi dari pengirim untuk
          memperbarui status menjadi <em>Diterima</em> atau <em>Selesai</em>.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daftar Disposisi</CardTitle>
          <CardDescription>
            Kotak <strong>Masuk</strong> menampilkan disposisi yang ditujukan kepada Anda atau unit
            Anda. Kotak <strong>Keluar</strong> berisi disposisi yang Anda kirim ke pihak lain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DispositionsClient />
        </CardContent>
      </Card>
    </div>
  );
}
