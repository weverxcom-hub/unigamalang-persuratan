"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
import {
  Archive as ArchiveIcon,
  Filter,
  Plus,
  Search,
  Trash2,
  X,
  Eye,
  Upload,
  Loader2,
} from "lucide-react";
import type { Archive, ArchiveListItem, ArchiveStatus, Role } from "@/lib/types";

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

const STATUS_LABEL: Record<ArchiveStatus, string> = {
  DRAFT: "Draf",
  PENDING: "Menunggu Persetujuan",
  PENDING_PROOF: "Menunggu Bukti",
  APPROVED: "Disetujui",
  ISSUED: "Terbit",
};

function statusVariant(status: ArchiveStatus): "default" | "secondary" | "success" | "warning" | "outline" {
  switch (status) {
    case "ISSUED":
      return "success";
    case "PENDING":
    case "PENDING_PROOF":
      return "warning";
    case "APPROVED":
      return "default";
    case "DRAFT":
    default:
      return "secondary";
  }
}

const MAX_PROOF_BYTES = 3 * 1024 * 1024; // 3MB

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ArchivesClient({ units, letterTypes, role, sessionUnitId }: Props) {
  const [archives, setArchives] = useState<ArchiveListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [unitId, setUnitId] = useState<string>("__all");
  const [letterTypeId, setLetterTypeId] = useState<string>("__all");
  const [year, setYear] = useState<string>("__all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proofArchive, setProofArchive] = useState<ArchiveListItem | null>(null);
  const [viewArchive, setViewArchive] = useState<ArchiveListItem | null>(null);

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
    const issued = archives.filter((a) => a.status === "ISSUED").length;
    const pendingProof = archives.filter((a) => a.status === "PENDING_PROOF").length;
    const pending = archives.filter((a) => a.status === "PENDING").length;
    return { total, issued, pendingProof, pending };
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

  function handleProofUploaded(updated: Archive) {
    // Apply only the lightweight fields to the list; don't store the heavy
    // base64 `fileDataUrl` here — the view dialog fetches it on demand.
    setArchives((prev) =>
      prev.map((a) =>
        a.id === updated.id
          ? {
              ...a,
              status: updated.status,
              fileName: updated.fileName,
              hasProof: !!updated.fileDataUrl,
            }
          : a
      )
    );
    setProofArchive(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <StatCard label="Total Arsip" value={stats.total} />
        <StatCard label="Terbit" value={stats.issued} />
        <StatCard label="Menunggu Bukti" value={stats.pendingProof} />
        <StatCard label="Menunggu Persetujuan" value={stats.pending} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ArchiveIcon className="h-5 w-5 text-primary" />
            <CardTitle>Daftar Arsip</CardTitle>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="w-full md:w-auto">
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

          {/* Mobile: card list */}
          <div className="space-y-2 md:hidden">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Memuat arsip…</p>
            ) : archives.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                <Filter className="mx-auto mb-2 h-5 w-5" />
                Tidak ada arsip sesuai filter.
              </p>
            ) : (
              archives.map((a) => (
                <div key={a.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <code className="rounded bg-muted px-2 py-0.5 text-xs font-semibold break-all">
                      {a.number}
                    </code>
                    <Badge variant={statusVariant(a.status)} className="shrink-0">
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </div>
                  <p className="mt-2 font-medium">{a.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.direction === "OUTGOING" ? "Tujuan" : "Pengirim"}: {a.recipient}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(a.date)} · {a.unitCode}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {a.hasProof ? (
                      <Button size="sm" variant="outline" onClick={() => setViewArchive(a)}>
                        <Eye className="h-4 w-4" />
                        Lihat Bukti
                      </Button>
                    ) : a.status === "PENDING_PROOF" ? (
                      <Button size="sm" onClick={() => setProofArchive(a)}>
                        <Upload className="h-4 w-4" />
                        Unggah Bukti
                      </Button>
                    ) : a.fileName ? (
                      <span className="text-xs italic text-muted-foreground">{a.fileName}</span>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(a.id)}
                      aria-label="Hapus arsip"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Tanggal</TableHead>
                  <TableHead>Nomor Surat</TableHead>
                  <TableHead>Perihal</TableHead>
                  <TableHead>Tujuan / Pengirim</TableHead>
                  <TableHead className="w-[90px]">Unit</TableHead>
                  <TableHead className="w-[150px]">Status</TableHead>
                  <TableHead className="w-[180px]">Bukti</TableHead>
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
                      <TableCell className="max-w-[240px] truncate font-medium" title={a.subject}>
                        {a.subject}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm" title={a.recipient}>
                        {a.recipient}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.unitCode}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(a.status)}>{STATUS_LABEL[a.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        {a.hasProof ? (
                          <Button size="sm" variant="outline" onClick={() => setViewArchive(a)}>
                            <Eye className="h-4 w-4" />
                            Lihat
                          </Button>
                        ) : a.status === "PENDING_PROOF" ? (
                          <Button size="sm" onClick={() => setProofArchive(a)}>
                            <Upload className="h-4 w-4" />
                            Unggah
                          </Button>
                        ) : a.fileName ? (
                          <span className="text-xs italic text-muted-foreground">{a.fileName}</span>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">—</span>
                        )}
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

      <ProofUploadDialog
        archive={proofArchive}
        onOpenChange={(open) => !open && setProofArchive(null)}
        onUploaded={handleProofUploaded}
      />

      <ProofViewDialog archive={viewArchive} onOpenChange={(open) => !open && setViewArchive(null)} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</p>
        <p className="mt-1 text-xl font-bold sm:text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}

interface ProofUploadDialogProps {
  archive: ArchiveListItem | null;
  onOpenChange: (open: boolean) => void;
  onUploaded: (archive: Archive) => void;
}

function ProofUploadDialog({ archive, onOpenChange, onUploaded }: ProofUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!archive) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl(null);
      setError(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [archive, previewUrl]);

  function pickFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError(null);
    setFile(f);
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    if (f.size > MAX_PROOF_BYTES) {
      setError("Ukuran file melebihi 3MB. Mohon perkecil atau kompres foto.");
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  }

  async function onUpload() {
    if (!archive || !file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch(`/api/archives/${archive.id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileDataUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal mengunggah bukti");
        return;
      }
      onUploaded(data.archive);
    } catch {
      setError("Gagal memproses file");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={!!archive} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Unggah Bukti Surat</DialogTitle>
          <DialogDescription>
            Arsip <code className="rounded bg-muted px-1 py-0.5 text-xs">{archive?.number}</code> akan berubah
            menjadi <strong>Terbit</strong> setelah bukti diunggah.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="proof-file"
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              Pilih / Ambil Foto
            </label>
            <input
              id="proof-file"
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-sm text-muted-foreground break-all">
              {file ? file.name : "Belum ada file"}
            </span>
          </div>

          {previewUrl && (
            <div className="overflow-hidden rounded-md border">
              <Image
                src={previewUrl}
                alt="Pratinjau bukti"
                width={600}
                height={400}
                unoptimized
                className="max-h-64 w-auto object-contain"
              />
            </div>
          )}
          {file && file.type === "application/pdf" && (
            <p className="text-xs text-muted-foreground">File PDF terpilih: {file.name}</p>
          )}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={onUpload} disabled={!file || uploading}>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            Unggah Bukti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProofViewDialog({
  archive,
  onOpenChange,
}: {
  archive: ArchiveListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!archive) {
      setDataUrl(null);
      setFileName(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/archives/${archive.id}/proof`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Gagal memuat bukti");
          setDataUrl(null);
          return;
        }
        setDataUrl(data.fileDataUrl ?? null);
        setFileName(data.fileName ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Gagal memuat bukti");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [archive]);

  const isPdf = dataUrl?.startsWith("data:application/pdf");

  return (
    <Dialog open={!!archive} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bukti Surat</DialogTitle>
          <DialogDescription>
            {archive?.number} &mdash; {archive?.subject}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Memuat bukti…
          </div>
        ) : error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : dataUrl ? (
          isPdf ? (
            <iframe
              src={dataUrl}
              className="h-[70vh] w-full rounded-md border"
              title="Pratinjau PDF"
            />
          ) : (
            <div className="overflow-auto rounded-md border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dataUrl}
                alt={fileName ?? "Bukti surat"}
                className="mx-auto max-h-[70vh] w-auto"
              />
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Bukti belum diunggah.</p>
        )}
        {fileName && (
          <p className="text-xs text-muted-foreground">Nama file: {fileName}</p>
        )}
      </DialogContent>
    </Dialog>
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
  const [file, setFile] = useState<File | null>(null);
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
      setFile(null);
      setError(null);
    }
  }, [open, defaultUnitId, letterTypes]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let fileName: string | null = null;
      let fileDataUrl: string | null = null;
      if (file) {
        if (file.size > MAX_PROOF_BYTES) {
          setError("Ukuran file melebihi 3MB.");
          return;
        }
        fileName = file.name;
        fileDataUrl = await readFileAsDataUrl(file);
      }
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
          fileDataUrl,
          manualNumber: manualNumber || null,
          status: fileDataUrl ? "ISSUED" : undefined,
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
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
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

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="m-number">Nomor Surat (manual, opsional)</Label>
            <Input
              id="m-number"
              value={manualNumber}
              placeholder="Kosongkan untuk membuat nomor baru otomatis"
              onChange={(e) => setManualNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="m-subject">Perihal</Label>
            <Input id="m-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="space-y-2 sm:col-span-2">
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
            <Label htmlFor="m-file">Bukti / Lampiran</Label>
            <input
              id="m-file"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Opsional. Jika diisi, arsip langsung berstatus <em>Terbit</em>.
            </p>
          </div>

          {error && (
            <div className="sm:col-span-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Arsip
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
