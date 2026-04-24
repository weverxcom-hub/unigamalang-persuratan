import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateForm } from "./generate-form";
import { toRoman } from "@/lib/utils";

export default async function GeneratePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [unitsRaw, letterTypesRaw] = await Promise.all([
    prisma.unit.findMany({ orderBy: { code: "asc" } }),
    prisma.letterType.findMany({ orderBy: { code: "asc" } }),
  ]);
  const visibleUnits = unitsRaw
    .filter((u) => session.role === "SUPER_ADMIN" || u.id === session.unitId)
    .map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      formatTemplate: u.formatTemplate,
      createdAt: u.createdAt.toISOString(),
    }));
  const letterTypes = letterTypesRaw.map((lt) => ({
    id: lt.id,
    code: lt.code,
    name: lt.name,
    createdAt: lt.createdAt.toISOString(),
  }));

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Penomoran Surat Otomatis</h1>
        <p className="text-sm text-muted-foreground">
          Format default: <code className="rounded bg-muted px-1.5 py-0.5">[NO]/[UNIT_CODE]/[TYPE_CODE]/[ROMAN_MONTH]/[YEAR]</code>
          &nbsp;&mdash; contoh: <strong>001/UNIGA/SK/{toRoman(month)}/{year}</strong>. Format dapat dikustomisasi per unit; nomor urut reset ke 001 setiap 1 Januari.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buat Nomor &amp; Arsipkan Surat</CardTitle>
          <CardDescription>
            {session.role === "USER"
              ? "Draf akan dikirim ke Admin Unit untuk disetujui sebelum terbit."
              : "Nomor akan dialokasikan dengan status PENDING_PROOF. Unggah foto/scan surat sebagai bukti untuk menyelesaikan arsip menjadi ISSUED."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateForm
            units={visibleUnits}
            letterTypes={letterTypes}
            defaultUnitId={session.unitId ?? visibleUnits[0]?.id ?? ""}
            isUser={session.role === "USER"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
