import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateForm } from "./generate-form";
import { toRoman } from "@/lib/utils";

export default async function GeneratePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // For per-unit letter types (TechSpec 3.1) we need to know each unit's
  // allowlist so the form can switch the dropdown when the selected unit
  // changes — without an extra round-trip per change. Fetch units + their
  // allowlist of UNIT_SPECIFIC letter types, plus all GLOBAL types, in one
  // server roundtrip; then partition on the client.
  const [unitsRaw, letterTypesRaw] = await Promise.all([
    prisma.unit.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      include: { letterTypes: { select: { letterTypeId: true } } },
    }),
    prisma.letterType.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
    }),
  ]);
  const visibleUnits = unitsRaw
    .filter((u) => session.role === "SUPER_ADMIN" || u.id === session.unitId)
    .map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      formatTemplate: u.formatTemplate,
      // Set of letter type ids this unit is explicitly allowlisted for.
      // GLOBAL letter types are not listed here — the form merges them in.
      allowedLetterTypeIds: u.letterTypes.map((lt) => lt.letterTypeId),
      createdAt: u.createdAt.toISOString(),
    }));
  const letterTypes = letterTypesRaw.map((lt) => ({
    id: lt.id,
    code: lt.code,
    name: lt.name,
    scope: lt.scope,
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
          Format default: <code className="rounded bg-muted px-1.5 py-0.5">[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]</code>
          &nbsp;&mdash; contoh: <strong>001/SK/UNIGA/{toRoman(month)}/{year}</strong>. Format dapat dikustomisasi per unit; nomor urut reset ke 001 setiap 1 Januari.
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
            sessionUserId={session.userId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
