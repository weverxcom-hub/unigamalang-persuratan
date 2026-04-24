"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { Archive as ArchiveIcon, Filter, Plus, Search, Trash2, X } from "lucide-react";
import type { Archive, Role } from "@/lib/types";

interface Props {
  units: { id: string; code: string; name: string }[];
  letterTypes: { id: string; code: string; name: string }[];
  role: Role;
  sessionUnitId: string | null;
}

const YEAR_OPTIONS = (() => {
  const curr = new Date().getFullYear();
  return [curr, curr - 1, curr - 2, curr - 3];
})();

export function ArchivesClient({ units, letterTypes, role, sessionUnitId }: Props) {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [unitId, setUnitId] = useState<string>("__all");
  const [letterTypeId, setLetterTypeId] = useState<string>("__all");
  const [year, setYear] = useState<string>("__all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (unitId !== "__all") params.set("unitId", unitId);
      if (letterTypeId !== "__all") params.set("letterTypeId", letterTypeId);
      if (year !== "__all") params.set("year", year);
      const res = await fetch(`/api/archives?${params.toString()}`);
      const data = await res.json();
      setArchives(data.archives ?? []);
    } finally {
      setLoading(false);
    }
  }, [q, unitId, letterTypeId, year]);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  const stats = useMemo(() => {
    const total = archives.length;
    const outgoing = archives.filter((a) => a.direction === "OUTGOING").length;
    const incoming = archives.filter((a) => a.direction === "INCOMING").length;
    const pending = archives.filter((a) => a.status === "PENDING").length;
    return { total, outgoing, incoming, pending };
  }, [archives]);

  function resetFilters() {
    setQ("");
    setUnitId("__all");
    setLetterTypeId("__all");
    setYear("__all");
  }

  async function onDelete(id: string) {
    if (!confirm("Hapus arsip ini? Tindakan tidak dapat dibatalkan.")) return;
    const res = await fetch(`/api/archives/${id}`, { method: "DELETE" });
    if (res.ok) {
      setArchives((prev) => prev.filter((a) => a.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Gagal menghapus arsip");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Arsip" value={stats.total} />
        <StatCard label="Surat Keluar" value={stats.outgoing} />
        <StatCard label="Surat Masuk" value={stats.incoming} />
        <StatCard label="Menunggu Persetujuan" value={stats.pending} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ArchiveIcon className="h-5 w-5 text-primary" />
            <CardTitle>Daftar Arsip</CardTitle>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Arsipkan Surat (Lama / Masuk)
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_140px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari nomor, perihal, atau tujuan…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Semua unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Semua Unit</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={letterTypeId} onValueChange={setLetterTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Semua jenis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Semua Jenis</SelectItem>
                {letterTypes.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>
                    {lt.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="Tahun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Semua Tahun</SelectItem>
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={y.toString()}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" type="button" onClick={resetFilters}>
              <X className="h-4 w-4" />
              Reset
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Tanggal</TableHead>
                  <TableHead>Nomor Surat</TableHead>
                  <TableHead>Perihal</TableHead>
                  <TableHead>Tujuan</TableHead>
                  <TableHead className="w-[110px]">Unit</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[120px]">Lampiran</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Memuat arsip…
                    </TableCell>
                  </TableRow>
                ) : archives.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      <Filter className="mx-auto mb-2 h-5 w-5" />
                      Tidak ada arsip sesuai filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  archives.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(a.date)}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-0.5 text-xs font-semibold">{a.number}</code>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate font-medium" title={a.subject}>
                        {a.subject}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm" title={a.recipient}>
                        {a.recipient}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.unitCode}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            a.status === "ISSUED"
                              ? "success"
                              : a.status === "PENDING"
                              ? "warning"
                              : a.status === "APPROVED"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.fileName ?? <span className="italic">—</span>}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(a.id)} aria-label="Hapus arsip">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ManualArchiveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        units={units}
        letterTypes={letterTypes}
        defaultUnitId={sessionUnitId ?? units[0]?.id ?? ""}
        canChooseUnit={role === "SUPER_ADMIN"}
        onCreated={() => {
          setDialogOpen(false);
          fetchArchives();
        }}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  units: { id: string; code: string; name: string }[];
  letterTypes: { id: string; code: string; name: string }[];
  defaultUnitId: string;
  canChooseUnit: boolean;
  onCreated: () => void;
}

function ManualArchiveDialog({
  open,
  onOpenChange,
  units,
  letterTypes,
  defaultUnitId,
  canChooseUnit,
  onCreated,
}: DialogProps) {
  const [unitId, setUnitId] = useState<string>(defaultUnitId);
  const [letterTypeId, setLetterTypeId] = useState<string>(letterTypes[0]?.id ?? "");
  const [manualNumber, setManualNumber] = useState("");
  const [direction, setDirection] = useState<"OUTGOING" | "INCOMING">("INCOMING");
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUnitId(defaultUnitId);
      setLetterTypeId(letterTypes[0]?.id ?? "");
      setManualNumber("");
      setDirection("INCOMING");
      setSubject("");
      setRecipient("");
      setDate(new Date().toISOString().slice(0, 10));
      setFileName(null);
      setError(null);
    }
  }, [open, defaultUnitId, letterTypes]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/archives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          letterTypeId,
          direction,
          subject,
          recipient,
          date,
          fileName,
          manualNumber: manualNumber || null,
          status: "ISSUED",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan arsip");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Tambah Arsip Manual</DialogTitle>
          <DialogDescription>
            Gunakan untuk mengarsipkan surat masuk atau surat lama yang nomornya sudah ada. Untuk nomor baru
            otomatis, gunakan halaman <strong>Buat Nomor Surat</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Arah Surat</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={direction === "INCOMING" ? "default" : "outline"}
                size="sm"
                onClick={() => setDirection("INCOMING")}
              >
                Surat Masuk
              </Button>
              <Button
                type="button"
                variant={direction === "OUTGOING" ? "default" : "outline"}
                size="sm"
                onClick={() => setDirection("OUTGOING")}
              >
                Surat Keluar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-unit">Unit</Label>
            <Select value={unitId} onValueChange={setUnitId} disabled={!canChooseUnit}>
              <SelectTrigger id="m-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-type">Jenis Surat</Label>
            <Select value={letterTypeId} onValueChange={setLetterTypeId}>
              <SelectTrigger id="m-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {letterTypes.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>
                    {lt.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 col-span-2">
            <Label htmlFor="m-number">Nomor Surat (manual, opsional)</Label>
            <Input
              id="m-number"
              value={manualNumber}
              placeholder="Kosongkan untuk membuat nomor baru otomatis"
              onChange={(e) => setManualNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2 col-span-2">
            <Label htmlFor="m-subject">Perihal</Label>
            <Input id="m-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="space-y-2 col-span-2">
            <Label htmlFor="m-recipient">{direction === "INCOMING" ? "Pengirim" : "Tujuan"}</Label>
            <Input
              id="m-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-date">Tanggal</Label>
            <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-file">Lampiran</Label>
            <input
              id="m-file"
              type="file"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="block w-full text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </div>

          {error && (
            <div className="col-span-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              Simpan Arsip
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
