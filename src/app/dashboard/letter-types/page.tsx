import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LetterTypesClient } from "./letter-types-client";

export default async function LetterTypesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");
  // PR-D: include join allowlist so the client can render scope badges and
  // edit the per-unit visibility list.
  const [activeRaw, inactiveRaw, unitsRaw, requestsRaw] = await Promise.all([
    prisma.letterType.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      include: { units: { select: { unitId: true } } },
    }),
    prisma.letterType.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { code: "asc" },
      include: { units: { select: { unitId: true } } },
    }),
    prisma.unit.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.letterTypeRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        unit: { select: { id: true, code: true, name: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);
  const toDto = (lt: typeof activeRaw[number]) => ({
    id: lt.id,
    code: lt.code,
    name: lt.name,
    scope: lt.scope as "GLOBAL" | "UNIT_SPECIFIC",
    allowedUnitIds: lt.units.map((u) => u.unitId),
    createdAt: lt.createdAt.toISOString(),
  });
  const letterTypes = activeRaw.map(toDto);
  const inactiveLetterTypes = inactiveRaw.map(toDto);
  const units = unitsRaw;
  const pendingRequests = requestsRaw.map((r) => ({
    id: r.id,
    proposedCode: r.proposedCode,
    proposedName: r.proposedName,
    reason: r.reason,
    status: r.status,
    unit: r.unit,
    requestedBy: r.requestedBy,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNote: r.reviewNote,
    letterTypeId: r.letterTypeId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
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
          <CardDescription>
            Jenis <strong>Global</strong> muncul di semua unit. Jenis <strong>Per Unit</strong> hanya
            muncul di unit yang dipilih (lihat kolom Unit Tujuan). Pengajuan dari Admin Unit muncul di
            bagian bawah halaman ini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LetterTypesClient
            initialLetterTypes={letterTypes}
            initialInactive={inactiveLetterTypes}
            units={units}
            initialPendingRequests={pendingRequests}
          />
        </CardContent>
      </Card>
    </div>
  );
}
