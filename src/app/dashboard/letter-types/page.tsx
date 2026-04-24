import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LetterTypesClient } from "./letter-types-client";

export default async function LetterTypesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");
  const db = getDb();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Jenis Surat</h1>
        <p className="text-sm text-muted-foreground">
          Kelola kode jenis surat (SK, ST, UND, dll.) yang digunakan dalam penomoran surat unigamalang.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daftar Jenis Surat</CardTitle>
          <CardDescription>Kode ini muncul sebagai segmen ketiga pada nomor surat.</CardDescription>
        </CardHeader>
        <CardContent>
          <LetterTypesClient initialLetterTypes={db.letterTypes} />
        </CardContent>
      </Card>
    </div>
  );
}
