// TechSpec PR-E: read-only ticket history for the reporter.
"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { Ticket, TicketStatus } from "@/lib/types";

interface Props {
  initialTickets: Ticket[];
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "Baru",
  IN_PROGRESS: "Sedang Ditangani",
  RESOLVED: "Selesai",
  CLOSED: "Ditutup",
};

function statusVariant(s: TicketStatus): "default" | "secondary" | "success" | "outline" {
  switch (s) {
    case "NEW":
      return "default";
    case "IN_PROGRESS":
      return "secondary";
    case "RESOLVED":
      return "success";
    case "CLOSED":
      return "outline";
  }
}

export function MyTicketsClient({ initialTickets }: Props) {
  const [tickets] = useState<Ticket[]>(initialTickets);
  const [selected, setSelected] = useState<Ticket | null>(null);

  if (tickets.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        Anda belum mengirim laporan apa pun. Gunakan tombol &ldquo;Laporkan Masalah&rdquo; di kanan
        atas halaman untuk membuat laporan pertama Anda.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[45%]">Judul</TableHead>
              <TableHead>Halaman</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tanggal Lapor</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.pageHint || "—"}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(t.status)}>{STATUS_LABEL[t.status]}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(t.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelected(t)}>
                    <Eye className="h-4 w-4" />
                    Detail
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              Dilaporkan {selected ? formatDate(selected.createdAt) : ""}
              {selected?.resolvedAt && ` · Diselesaikan ${formatDate(selected.resolvedAt)}`}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(selected.status)}>{STATUS_LABEL[selected.status]}</Badge>
                {selected.assignedToName && (
                  <span className="text-xs text-muted-foreground">
                    Ditangani: {selected.assignedToName}
                  </span>
                )}
              </div>
              {selected.pageHint && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Halaman / fitur</p>
                  <p className="text-sm">{selected.pageHint}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Deskripsi</p>
                <p className="whitespace-pre-wrap text-sm">{selected.description}</p>
              </div>
              {selected.screenshotUrl && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Lampiran</p>
                  <a
                    href={selected.screenshotUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.screenshotUrl}
                      alt="Screenshot lampiran"
                      className="max-h-64 w-auto rounded-md border"
                    />
                  </a>
                </div>
              )}
              {selected.responseNote ? (
                <div className="rounded-md border-l-4 border-primary bg-primary/5 p-3">
                  <p className="text-xs font-semibold uppercase text-primary">Respons Superadmin</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{selected.responseNote}</p>
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  Belum ada respons dari superadmin.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelected(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
