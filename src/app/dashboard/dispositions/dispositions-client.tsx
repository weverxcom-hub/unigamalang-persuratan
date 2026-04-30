"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Inbox, Send, FileText, ExternalLink } from "lucide-react";

type Status = "PENDING" | "ACKNOWLEDGED" | "COMPLETED" | "REJECTED";
type Box = "inbox" | "outbox";

interface Disposition {
  id: string;
  archiveId: string;
  archiveNumber: string;
  archiveSubject: string;
  archiveDirection: "INCOMING" | "OUTGOING";
  archiveUnitCode: string;
  externalSender: string | null;
  fromUserId: string;
  fromUserName: string;
  toUserId: string | null;
  toUserName: string | null;
  toUnitId: string | null;
  toUnitName: string | null;
  toUnitCode: string | null;
  instructions: string;
  dueDate: string | null;
  status: Status;
  note: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Dikirim",
  ACKNOWLEDGED: "Diterima",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
};

function statusVariant(s: Status): "default" | "secondary" | "destructive" | "success" | "warning" {
  switch (s) {
    case "PENDING":
      return "warning";
    case "ACKNOWLEDGED":
      return "secondary";
    case "COMPLETED":
      return "success";
    case "REJECTED":
      return "destructive";
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function DispositionsClient() {
  const [box, setBox] = useState<Box>("inbox");
  const [statusFilter, setStatusFilter] = useState<"__all" | Status>("__all");
  const [items, setItems] = useState<Disposition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Disposition | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ box });
      if (statusFilter !== "__all") params.set("status", statusFilter);
      const res = await fetch(`/api/dispositions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal memuat disposisi");
        setItems([]);
      } else {
        setItems(data.dispositions ?? []);
      }
    } catch {
      setError("Terjadi kesalahan jaringan");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [box, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const counts = useMemo(() => {
    const c = { PENDING: 0, ACKNOWLEDGED: 0, COMPLETED: 0, REJECTED: 0 };
    for (const d of items) c[d.status]++;
    return c;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full overflow-hidden rounded-md border sm:w-auto">
          <button
            type="button"
            onClick={() => setBox("inbox")}
            className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2 text-sm transition-colors ${
              box === "inbox" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            <Inbox className="h-4 w-4" />
            Masuk
          </button>
          <button
            type="button"
            onClick={() => setBox("outbox")}
            className={`flex flex-1 items-center justify-center gap-1.5 border-l px-4 py-2 text-sm transition-colors ${
              box === "outbox" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            <Send className="h-4 w-4" />
            Keluar
          </button>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "__all")}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Semua status</SelectItem>
            <SelectItem value="PENDING">Dikirim</SelectItem>
            <SelectItem value="ACKNOWLEDGED">Diterima</SelectItem>
            <SelectItem value="COMPLETED">Selesai</SelectItem>
            <SelectItem value="REJECTED">Ditolak</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {box === "inbox" && counts.PENDING > 0 && (
        <div className="rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Anda memiliki <strong>{counts.PENDING}</strong> disposisi yang belum ditindaklanjuti.
        </div>
      )}

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Surat</TableHead>
              <TableHead>{box === "inbox" ? "Dari" : "Kepada"}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada disposisi.
                </TableCell>
              </TableRow>
            ) : (
              items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {fmtDate(d.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {d.archiveNumber}
                        </p>
                        <p className="truncate text-sm font-medium">{d.archiveSubject}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {box === "inbox"
                      ? d.fromUserName
                      : d.toUserName ?? d.toUnitName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(d.status)}>{STATUS_LABEL[d.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(d)}>
                        Detail
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label="Buka tanda terima"
                        title="Tanda terima surat"
                      >
                        <Link href={`/dashboard/archives/${d.archiveId}/receipt`} target="_blank">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DispositionDetailDialog
        disposition={selected}
        box={box}
        onOpenChange={(open) => !open && setSelected(null)}
        onUpdated={() => {
          setSelected(null);
          fetchData();
        }}
      />
    </div>
  );
}

function DispositionDetailDialog({
  disposition,
  box,
  onOpenChange,
  onUpdated,
}: {
  disposition: Disposition | null;
  box: Box;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote(disposition?.note ?? "");
    setError(null);
  }, [disposition?.id, disposition?.note]);

  if (!disposition) return null;

  const canUpdate = box === "inbox" && disposition.status !== "COMPLETED" && disposition.status !== "REJECTED";

  async function updateStatus(target: Status) {
    if (!disposition) return;
    setSubmitting(target);
    setError(null);
    try {
      const res = await fetch(`/api/dispositions/${disposition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target, note: note || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal memperbarui status");
        return;
      }
      onUpdated();
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Dialog open={!!disposition} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detail Disposisi</DialogTitle>
          <DialogDescription>
            Surat <span className="font-mono text-xs">{disposition.archiveNumber}</span> —{" "}
            {disposition.archiveSubject}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <div className="text-muted-foreground">Dari</div>
            <div className="col-span-2 font-medium">{disposition.fromUserName}</div>
            <div className="text-muted-foreground">Kepada</div>
            <div className="col-span-2">
              {disposition.toUserName ?? disposition.toUnitName ?? "—"}
              {disposition.toUnitCode && ` (${disposition.toUnitCode})`}
            </div>
            <div className="text-muted-foreground">Tanggal</div>
            <div className="col-span-2">{fmtDate(disposition.createdAt)}</div>
            <div className="text-muted-foreground">Tenggat</div>
            <div className="col-span-2">{fmtDate(disposition.dueDate)}</div>
            <div className="text-muted-foreground">Status</div>
            <div className="col-span-2">
              <Badge variant={statusVariant(disposition.status)}>{STATUS_LABEL[disposition.status]}</Badge>
              {disposition.acknowledgedAt && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Diterima {fmtDate(disposition.acknowledgedAt)}
                </span>
              )}
              {disposition.completedAt && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Selesai {fmtDate(disposition.completedAt)}
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground">Instruksi</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">
              {disposition.instructions}
            </p>
          </div>

          {canUpdate ? (
            <div className="space-y-1.5">
              <label htmlFor="dispo-note" className="text-xs font-semibold text-muted-foreground">
                Catatan (opsional)
              </label>
              <textarea
                id="dispo-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Tambahkan catatan untuk pengirim disposisi"
              />
            </div>
          ) : disposition.note ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Catatan Penerima</p>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">
                {disposition.note}
              </p>
            </div>
          ) : null}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button asChild variant="outline">
            <Link href={`/dashboard/archives/${disposition.archiveId}/receipt`} target="_blank">
              Lihat Tanda Terima
            </Link>
          </Button>
          {canUpdate && (
            <>
              {disposition.status === "PENDING" && (
                <Button
                  variant="secondary"
                  disabled={submitting !== null}
                  onClick={() => updateStatus("ACKNOWLEDGED")}
                >
                  {submitting === "ACKNOWLEDGED" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Tandai Diterima
                </Button>
              )}
              <Button
                disabled={submitting !== null}
                onClick={() => updateStatus("COMPLETED")}
              >
                {submitting === "COMPLETED" && <Loader2 className="h-4 w-4 animate-spin" />}
                Tandai Selesai
              </Button>
              <Button
                variant="destructive"
                disabled={submitting !== null}
                onClick={() => updateStatus("REJECTED")}
              >
                {submitting === "REJECTED" && <Loader2 className="h-4 w-4 animate-spin" />}
                Tolak
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
