import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateForm } from "./generate-form";
import { DEFAULT_FORMAT_TEMPLATE, formatExample, formatSequence } from "@/lib/format";
import { getJakartaParts } from "@/lib/timezone";

export default async function GeneratePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // For per-unit letter types (TechSpec 3.1) we need to know each unit's
  // allowlist so the form can switch the dropdown when the selected unit
  // changes — without an extra round-trip per change. Fetch units + their
  // allowlist of UNIT_SPECIFIC letter types, plus all GLOBAL types, in one
  // server roundtrip; then partition on the client.
  const [unitsRaw, letterTypesRaw, policy] = await Promise.all([
    prisma.unit.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      include: { letterTypes: { select: { letterTypeId: true } } },
    }),
    prisma.letterType.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
    }),
    // Set once the 2027 numbering rule is applied (/dashboard/numbering-rule).
    prisma.numberingPolicy.findUnique({ where: { id: 1 } }),
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

  const { year, month } = getJakartaParts();
  const template = policy?.template ?? DEFAULT_FORMAT_TEMPLATE;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Penomoran Surat Otomatis</h1>
        <p className="text-sm text-muted-foreground">
          {policy ? "Format yang berlaku" : "Format default"}:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">{template}</code>
          &nbsp;&mdash; contoh: <strong>{formatExample(template, month, year)}</strong>. Nomor urut berjalan per
          unit dan jenis surat, kembali ke {formatSequence(template, 1)} setiap 1 Januari.
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
            ccUnitOptions={unitsRaw.map((u) => ({ id: u.id, code: u.code, name: u.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
