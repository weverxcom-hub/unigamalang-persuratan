import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LetterTypeRequestsClient } from "./letter-type-requests-client";

// PR-D: ADMIN_UNIT-facing page where they can submit requests for new
// UNIT_SPECIFIC letter types and see the status of their previous requests.
// SUPER_ADMIN handles approvals on /dashboard/letter-types — they don't need
// this page.
export default async function LetterTypeRequestsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN_UNIT") redirect("/dashboard");

  const requests = await prisma.letterTypeRequest.findMany({
    where: { requestedById: session.userId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      unit: { select: { id: true, code: true, name: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
    take: 200,
  });

  const dto = requests.map((r) => ({
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
        <h1 className="text-2xl font-bold tracking-tight">Pengajuan Jenis Surat</h1>
        <p className="text-sm text-muted-foreground">
          Ajukan kode jenis surat baru yang spesifik untuk unit Anda. Pengajuan akan ditinjau oleh
          superadmin sebelum dapat digunakan.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daftar Pengajuan</CardTitle>
          <CardDescription>
            Pengajuan PENDING menunggu tinjauan superadmin. Pengajuan APPROVED otomatis tersedia di
            halaman penomoran untuk unit Anda. Pengajuan REJECTED disertai alasan dari superadmin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LetterTypeRequestsClient initialRequests={dto} />
        </CardContent>
      </Card>
    </div>
  );
}
