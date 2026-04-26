import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LetterTypesClient } from "./letter-types-client";

export default async function LetterTypesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");
  const letterTypesRaw = await prisma.letterType.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
  });
  const letterTypes = letterTypesRaw.map((lt) => ({
    id: lt.id,
    code: lt.code,
    name: lt.name,
    createdAt: lt.createdAt.toISOString(),
  }));
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
          <LetterTypesClient initialLetterTypes={letterTypes} />
        </CardContent>
      </Card>
    </div>
  );
}
