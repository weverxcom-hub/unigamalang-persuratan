// TechSpec PR-E (3.4): superadmin queue for in-app help-desk tickets.
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
import { TicketsAdminClient } from "./tickets-admin-client";
import type { Ticket } from "@/lib/types";

function serialize(t: {
  id: string;
  title: string;
  description: string;
  pageHint: string | null;
  screenshotUrl: string | null;
  status: "NEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  responseNote: string | null;
  createdById: string;
  unitId: string | null;
  assignedToId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string; email: string };
  unit: { id: string; code: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
}): Ticket {
  return {
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
  };
}

export default async function TicketsAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const tickets = await prisma.ticket.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, code: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const initial = tickets.map(serialize);
  const newCount = initial.filter((t) => t.status === "NEW").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tiket Laporan Pengguna</h1>
        <p className="text-sm text-muted-foreground">
          Daftar laporan masalah yang dikirim oleh pengguna dari tombol &ldquo;Laporkan Masalah&rdquo;.
          {newCount > 0 && (
            <>
              {" "}
              Saat ini ada <strong>{newCount}</strong> tiket baru yang belum ditinjau.
            </>
          )}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daftar Tiket</CardTitle>
          <CardDescription>
            Klik tiket untuk melihat detail, mengubah status, atau memberi respons kepada pelapor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TicketsAdminClient initialTickets={initial} />
        </CardContent>
      </Card>
    </div>
  );
}
