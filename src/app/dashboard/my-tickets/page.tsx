// TechSpec PR-E (3.4): "Laporan Saya" — pelapor dapat melihat status tiket
// mereka beserta respons dari superadmin.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MyTicketsClient } from "./my-tickets-client";
import type { Ticket } from "@/lib/types";

export default async function MyTicketsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tickets = await prisma.ticket.findMany({
    where: { createdById: session.userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, code: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const initial: Ticket[] = tickets.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    pageHint: t.pageHint,
    screenshotUrl: t.screenshotUrl,
    status: t.status,
    responseNote: t.responseNote,
    createdById: t.createdById,
    createdByName: t.createdBy.name,
    createdByEmail: t.createdBy.email,
    unitId: t.unitId,
    unitCode: t.unit?.code ?? null,
    unitName: t.unit?.name ?? null,
    assignedToId: t.assignedToId,
    assignedToName: t.assignedTo?.name ?? null,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Laporan Saya</h1>
        <p className="text-sm text-muted-foreground">
          Pantau status laporan masalah yang Anda kirim. Untuk melaporkan masalah baru,
          gunakan tombol &ldquo;Laporkan Masalah&rdquo; di kanan atas halaman.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Laporan</CardTitle>
          <CardDescription>
            Klik tiket untuk melihat respons superadmin (bila ada).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MyTicketsClient initialTickets={initial} />
        </CardContent>
      </Card>
    </div>
  );
}
