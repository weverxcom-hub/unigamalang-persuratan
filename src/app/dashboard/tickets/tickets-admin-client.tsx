// TechSpec PR-E: superadmin ticket queue. Mirrors the look-and-feel of the
// existing letter-types admin table.
"use client";
import { useMemo, useState } from "react";
import { Loader2, Eye, MessageSquare, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const STATUS_FILTER_OPTIONS: Array<{ value: "ALL" | TicketStatus; label: string }> = [
  { value: "ALL", label: "Semua status" },
  { value: "NEW", label: "Baru" },
  { value: "IN_PROGRESS", label: "Sedang Ditangani" },
  { value: "RESOLVED", label: "Selesai" },
  { value: "CLOSED", label: "Ditutup" },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "Baru",
  IN_PROGRESS: "Sedang Ditangani",
  RESOLVED: "Selesai",
  CLOSED: "Ditutup",
};

function statusBadgeVariant(s: TicketStatus): "default" | "secondary" | "success" | "outline" {
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

export function TicketsAdminClient({ initialTickets }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [filter, setFilter] = useState<"ALL" | TicketStatus>("ALL");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<TicketStatus>("NEW");
  const [editNote, setEditNote] = useState("");

  const filtered = useMemo(
    () => (filter === "ALL" ? tickets : tickets.filter((t) => t.status === filter)),
    [tickets, filter]
  );

  function openTicket(t: Ticket) {
    setSelected(t);
    setEditStatus(t.status);
    setEditNote(t.responseNote ?? "");
    setError(null);
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets");
      if (!res.ok) return;
      const data = (await res.json()) as { tickets: Ticket[] };
      setTickets(data.tickets);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          responseNote: editNote.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ticket?: Ticket; error?: string } | null;
      if (!res.ok || !data?.ticket) {
        setError(data?.error ?? "Gagal menyimpan perubahan.");
        return;
      }
      const updated = data.ticket;
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Filter status</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as "ALL" | TicketStatus)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Muat ulang
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Judul</TableHead>
              <TableHead>Pelapor</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Tidak ada tiket dengan status ini.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="font-medium">{t.title}</div>
                  {t.pageHint && (
                    <div className="text-xs text-muted-foreground">@ {t.pageHint}</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{t.createdByName}</div>
                  <div className="text-xs text-muted-foreground">{t.createdByEmail}</div>
                </TableCell>
                <TableCell>
                  {t.unitCode ? (
                    <Badge variant="outline">{t.unitCode}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(t.status)}>{STATUS_LABEL[t.status]}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(t.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => openTicket(t)}>
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
              Tiket dari {selected?.createdByName} ({selected?.createdByEmail})
              {selected?.unitCode ? ` · Unit ${selected.unitCode}` : ""} ·{" "}
              {selected ? formatDate(selected.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
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
              <div className="grid gap-2">
                <Label htmlFor="ticket-status">Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as TicketStatus)}>
                  <SelectTrigger id="ticket-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEW">Baru</SelectItem>
                    <SelectItem value="IN_PROGRESS">Sedang Ditangani</SelectItem>
                    <SelectItem value="RESOLVED">Selesai</SelectItem>
                    <SelectItem value="CLOSED">Ditutup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ticket-note">
                  <MessageSquare className="mr-1 inline h-3.5 w-3.5" />
                  Respons untuk pelapor (opsional)
                </Label>
                <textarea
                  id="ticket-note"
                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Catatan tindak lanjut yang akan dilihat pelapor di halaman Laporan Saya."
                  maxLength={5000}
                />
              </div>
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelected(null)} disabled={loading}>
              Batal
            </Button>
            <Button type="button" onClick={save} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
