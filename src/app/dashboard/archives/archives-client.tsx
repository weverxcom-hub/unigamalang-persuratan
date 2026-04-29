"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import Link from "next/link";
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
  FileText,
  Send,
  Printer,
  Download,
} from "lucide-react";
import type { Archive, ArchiveListItem, ArchiveStatus, Role } from "@/lib/types";
import {
  uploadProofAsset,
  assetToProofBody,
  UploadError,
  BLOB_MAX_BYTES,
} from "@/lib/upload-client";
import { bundleProofFiles, isImageFile } from "@/lib/proof-bundle";

interface Props {
  units: { id: string; code: string; name: string; formatTemplate?: string }[];
  letterTypes: { id: string; code: string; name: string }[];
  role: Role;
  sessionUnitId: string | null;
  sessionUserId: string;
  sessionUserName: string;
}

const YEAR_OPTIONS = (() => {
  const curr = new Date().getFullYear();
  return [curr, curr - 1, curr - 2, curr - 3];
})();

function buildArchiveQuery(filters: {
  q?: string;
  unitId?: string;
  letterTypeId?: string;
  year?: string;
  direction?: string;
  dateFrom?: string;
  dateTo?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.unitId && filters.unitId !== "__all") params.set("unitId", filters.unitId);
  if (filters.letterTypeId && filters.letterTypeId !== "__all")
    params.set("letterTypeId", filters.letterTypeId);
  if (filters.year && filters.year !== "__all") params.set("year", filters.year);
  if (filters.direction && filters.direction !== "__all")
    params.set("direction", filters.direction);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return params.toString();
}

function buildPrintUrl(filters: Parameters<typeof buildArchiveQuery>[0]) {
  const qs = buildArchiveQuery(filters);
  return qs ? `/print/archives?${qs}` : "/print/archives";
}

function buildExportUrl(
  filters: Parameters<typeof buildArchiveQuery>[0],
  format: "csv" | "xlsx"
) {
  const qs = buildArchiveQuery(filters);
  return `/api/archives/export?format=${format}${qs ? `&${qs}` : ""}`;
}

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

export function ArchivesClient({
  units,
  letterTypes,
  role,
  sessionUnitId,
  sessionUserId,
  sessionUserName,
}: Props) {
  const [archives, setArchives] = useState<ArchiveListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [unitId, setUnitId] = useState<string>("__all");
  const [letterTypeId, setLetterTypeId] = useState<string>("__all");
  const [year, setYear] = useState<string>("__all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proofArchive, setProofArchive] = useState<ArchiveListItem | null>(null);
  const [viewArchive, setViewArchive] = useState<ArchiveListItem | null>(null);
  const [direction, setDirection] = useState<string>("__all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [disposeArchive, setDisposeArchive] = useState<ArchiveListItem | null>(null);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (unitId !== "__all") params.set("unitId", unitId);
      if (letterTypeId !== "__all") params.set("letterTypeId", letterTypeId);
      if (year !== "__all") params.set("year", year);
      if (direction !== "__all") params.set("direction", direction);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/archives?${params.toString()}`);
      const data = await res.json();
      setArchives(data.archives ?? []);
    } finally {
      setLoading(false);
    }
  }, [q, unitId, letterTypeId, year, direction, dateFrom, dateTo]);

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
    setDirection("__all");
    setDateFrom("");
    setDateTo("");
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
              hasProof: !!(updated.fileUrl || updated.fileDataUrl),
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
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button variant="outline" type="button" asChild>
              <a
                href={buildExportUrl({ q, unitId, letterTypeId, year, direction, dateFrom, dateTo }, "csv")}
                rel="noreferrer"
              >
                <Download className="h-4 w-4" />
                CSV
              </a>
            </Button>
            <Button variant="outline" type="button" asChild>
              <a
                href={buildExportUrl({ q, unitId, letterTypeId, year, direction, dateFrom, dateTo }, "xlsx")}
                rel="noreferrer"
              >
                <Download className="h-4 w-4" />
                Excel
              </a>
            </Button>
            <Button variant="outline" type="button" asChild>
              <a href={buildPrintUrl({ q, unitId, letterTypeId, year, direction, dateFrom, dateTo })} target="_blank" rel="noreferrer">
                <Printer className="h-4 w-4" />
                Cetak
              </a>
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="w-full md:w-auto">
              <Plus className="h-4 w-4" />
              Arsipkan Surat (Lama / Masuk)
            </Button>
          </div>
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
          <div className="grid gap-3 md:grid-cols-[180px_180px_180px_1fr]">
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger>
                <SelectValue placeholder="Arah" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Semua Arah</SelectItem>
                <SelectItem value="OUTGOING">Surat Keluar</SelectItem>
                <SelectItem value="INCOMING">Surat Masuk</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Label htmlFor="date-from" className="text-xs text-muted-foreground">Dari</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date-to" className="text-xs text-muted-foreground">Sampai</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div />
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
                    {a.direction === "OUTGOING" ? "Tujuan" : "Pengirim"}:{" "}
                    {a.direction === "INCOMING" ? a.externalSender ?? a.recipient : a.recipient}
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
                      <TableCell
                        className="max-w-[180px] truncate text-sm"
                        title={a.direction === "INCOMING" ? a.externalSender ?? a.recipient : a.recipient}
                      >
                        {a.direction === "INCOMING" ? a.externalSender ?? a.recipient : a.recipient}
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
                        <div className="flex items-center gap-1">
                          {a.direction === "INCOMING" && (
                            <>
                              <Button
                                asChild
                                variant="ghost"
                                size="icon"
                                aria-label="Tanda terima"
                                title="Tanda terima"
                              >
                                <Link href={`/dashboard/archives/${a.id}/receipt`} target="_blank">
                                  <FileText className="h-4 w-4" />
                                </Link>
                              </Button>
                              {role !== "USER" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Disposisi"
                                  title="Disposisi"
                                  onClick={() => setDisposeArchive(a)}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => onDelete(a.id)} aria-label="Hapus arsip">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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
        sessionUserId={sessionUserId}
        defaultRecipientLabel={(() => {
          const myUnit = units.find((u) => u.id === sessionUnitId);
          return myUnit ? `${sessionUserName} (${myUnit.code})` : sessionUserName;
        })()}
        onCreated={() => {
          setDialogOpen(false);
          fetchArchives();
        }}
      />

      <ProofUploadDialog
        archive={proofArchive}
        sessionUserId={sessionUserId}
        onOpenChange={(open) => !open && setProofArchive(null)}
        onUploaded={handleProofUploaded}
      />

      <ProofViewDialog archive={viewArchive} onOpenChange={(open) => !open && setViewArchive(null)} />

      <DispositionDialog
        archive={disposeArchive}
        units={units}
        onOpenChange={(open) => !open && setDisposeArchive(null)}
        onCreated={() => setDisposeArchive(null)}
      />
    </div>
  );
}

function DispositionDialog({
  archive,
  units,
  onOpenChange,
  onCreated,
}: {
  archive: ArchiveListItem | null;
  units: Props["units"];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [toUserId, setToUserId] = useState<string>("__none");
  const [toUnitId, setToUnitId] = useState<string>("__none");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!archive) {
      setToUserId("__none");
      setToUnitId("__none");
      setInstructions("");
      setDueDate("");
      setError(null);
      return;
    }
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setUsers([]));
  }, [archive]);

  async function onSubmit() {
    if (!archive) return;
    if (toUserId === "__none" && toUnitId === "__none") {
      setError("Pilih pengguna atau unit tujuan");
      return;
    }
    if (instructions.trim().length < 3) {
      setError("Instruksi wajib diisi (minimal 3 karakter)");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/archives/${archive.id}/dispositions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: toUserId === "__none" ? null : toUserId,
          toUnitId: toUnitId === "__none" ? null : toUnitId,
          instructions,
          dueDate: dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat disposisi");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!archive} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat Disposisi</DialogTitle>
          <DialogDescription>
            Teruskan arsip <code className="rounded bg-muted px-1 py-0.5 text-xs">{archive?.number}</code>{" "}
            kepada pengguna atau unit tertentu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Tujukan ke Pengguna (opsional)</Label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih pengguna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— tidak ditentukan —</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Atau Tujukan ke Unit (opsional)</Label>
            <Select value={toUnitId} onValueChange={setToUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— tidak ditentukan —</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="disp-instr">Instruksi</Label>
            <textarea
              id="disp-instr"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Mohon ditindaklanjuti…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="disp-due">Batas Waktu (opsional)</Label>
            <Input
              id="disp-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Kirim Disposisi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  sessionUserId: string;
  onOpenChange: (open: boolean) => void;
  onUploaded: (archive: Archive) => void;
}

function ProofUploadDialog({
  archive,
  sessionUserId,
  onOpenChange,
  onUploaded,
}: ProofUploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!archive) {
      setFiles([]);
      setError(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [archive]);

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setError(null);
    const incoming = Array.from(picked);
    // Reject any single file that exceeds the upload cap up front. The bundle
    // step (multi-image -> PDF) usually shrinks JPGs further, but we still
    // protect against absurd inputs.
    const tooBig = incoming.find((f) => f.size > BLOB_MAX_BYTES * 5);
    if (tooBig) {
      setError(`File "${tooBig.name}" terlalu besar (>25MB).`);
      return;
    }
    setFiles((prev) => {
      const next = [...prev, ...incoming];
      const totalImages = next.filter(isImageFile).length;
      const totalNonImages = next.length - totalImages;
      if (totalImages > 0 && totalNonImages > 0) {
        setError(
          "Tidak bisa mencampur foto dan PDF/Word. Pilih semua foto, atau satu file PDF."
        );
        return prev;
      }
      if (totalNonImages > 1) {
        setError("Hanya satu file PDF/Word yang dapat diunggah.");
        return prev;
      }
      return next;
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onUpload() {
    if (!archive || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const baseName = `${archive.number}_${archive.subject}`.slice(0, 80);
      const { file: bundled, merged } = await bundleProofFiles(files, baseName);
      void merged;
      const asset = await uploadProofAsset(sessionUserId, bundled);
      const res = await fetch(`/api/archives/${archive.id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetToProofBody(asset)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal mengunggah bukti");
        return;
      }
      onUploaded(data.archive);
    } catch (e) {
      if (e instanceof UploadError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Gagal memproses file. Periksa koneksi dan coba lagi.");
      }
    } finally {
      setUploading(false);
    }
  }

  const imageCount = files.filter(isImageFile).length;
  const willMerge = imageCount >= 2;

  return (
    <Dialog open={!!archive} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Unggah Bukti Surat</DialogTitle>
          <DialogDescription>
            Arsip <code className="rounded bg-muted px-1 py-0.5 text-xs">{archive?.number}</code> akan berubah
            menjadi <strong>Terbit</strong> setelah bukti diunggah. Pilih beberapa foto sekaligus untuk surat
            multi-halaman; sistem akan menggabungkannya jadi satu PDF otomatis.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="proof-file"
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              {files.length === 0 ? "Pilih / Ambil Foto" : "Tambah Foto"}
            </label>
            <input
              id="proof-file"
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <ul className="space-y-1.5 rounded-md border p-2 text-sm">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {i + 1}. {f.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({(f.size / 1024).toFixed(0)} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Hapus ${f.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {willMerge && (
            <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
              {imageCount} foto akan digabung jadi 1 PDF saat diunggah.
            </p>
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
          <Button onClick={onUpload} disabled={files.length === 0 || uploading}>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {willMerge ? "Gabung & Unggah Bukti" : "Unggah Bukti"}
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
        setDataUrl(data.fileUrl ?? data.fileDataUrl ?? null);
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

  const isGdrive = !!dataUrl && /^https:\/\/(drive|docs)\.google\.com\//i.test(dataUrl);
  // Drive webViewLink (`/file/d/<id>/view`) cannot be iframed, but the
  // sibling `/preview` URL has a permissive frame policy and works for
  // both images and PDFs.
  const gdrivePreview = isGdrive
    ? dataUrl!.replace(/\/view(\?[^#]*)?$/, "/preview")
    : null;
  const isPdf =
    !!dataUrl &&
    !isGdrive &&
    (dataUrl.startsWith("data:application/pdf") || /\.pdf(\?|#|$)/i.test(dataUrl));

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
          isGdrive ? (
            <div className="space-y-2">
              <iframe
                src={gdrivePreview!}
                className="h-[70vh] w-full rounded-md border"
                title="Pratinjau Google Drive"
                allow="autoplay"
              />
              <p className="text-xs text-muted-foreground">
                Tersimpan di Google Drive.{" "}
                <a
                  href={dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  Buka di tab baru
                </a>
                .
              </p>
            </div>
          ) : isPdf ? (
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
  sessionUserId: string;
  defaultRecipientLabel: string;
  onCreated: () => void;
}

function ManualArchiveDialog({
  open,
  onOpenChange,
  units,
  letterTypes,
  defaultUnitId,
  canChooseUnit,
  sessionUserId,
  defaultRecipientLabel,
  onCreated,
}: DialogProps) {
  const [unitId, setUnitId] = useState<string>(defaultUnitId);
  const [letterTypeId, setLetterTypeId] = useState<string>(letterTypes[0]?.id ?? "");
  const [manualNumber, setManualNumber] = useState("");
  const [direction, setDirection] = useState<"OUTGOING" | "INCOMING">("INCOMING");
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [externalSender, setExternalSender] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUnitId(defaultUnitId);
      // Default to a "generic" letter type if one exists (UMUM/UND/SP) so
      // INCOMING tidak memaksa user memilih klasifikasi yang tidak mereka tahu.
      const preferredCodes = ["UMUM", "SP", "UND"];
      const preferred = letterTypes.find((lt) => preferredCodes.includes(lt.code));
      setLetterTypeId(preferred?.id ?? letterTypes[0]?.id ?? "");
      setManualNumber("");
      setDirection("INCOMING");
      setSubject("");
      // For INCOMING, the "Diteruskan ke" defaults to the logged-in user.
      // User can override if the letter is being forwarded to someone else.
      setRecipient(defaultRecipientLabel);
      setExternalSender("");
      setDate(new Date().toISOString().slice(0, 10));
      setFiles([]);
      setError(null);
    }
  }, [open, defaultUnitId, letterTypes, defaultRecipientLabel]);

  // When user toggles direction, reset recipient to a sensible default.
  useEffect(() => {
    if (direction === "INCOMING") {
      setRecipient((prev) => (prev ? prev : defaultRecipientLabel));
    } else {
      // Outgoing: default empty so user types the external recipient.
      setRecipient((prev) => (prev === defaultRecipientLabel ? "" : prev));
    }
  }, [direction, defaultRecipientLabel]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let fileFields: Record<string, unknown> = {
        fileName: null,
        fileUrl: null,
        blobPathname: null,
        fileDataUrl: null,
      };
      if (files.length > 0) {
        try {
          const baseName = (manualNumber || subject || "arsip").slice(0, 80);
          const { file: bundled } = await bundleProofFiles(files, baseName);
          const asset = await uploadProofAsset(sessionUserId, bundled);
          fileFields = { ...fileFields, ...assetToProofBody(asset) };
        } catch (err) {
          if (err instanceof UploadError) {
            setError(err.message);
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError("Gagal memproses file. Periksa koneksi dan coba lagi.");
          }
          return;
        }
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
          externalSender: direction === "INCOMING" ? externalSender : null,
          date,
          ...fileFields,
          manualNumber: manualNumber || null,
          // Status is computed server-side based on role + manualNumber + file.
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan arsip");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  const isIncoming = direction === "INCOMING";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Tambah Arsip Manual</DialogTitle>
          <DialogDescription>
            Gunakan untuk mengarsipkan surat masuk dari instansi luar atau surat lama yang nomornya sudah ada.
            Untuk membuat nomor surat keluar baru otomatis, pakai halaman <strong>Buat Nomor Surat</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Arah Surat</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={isIncoming ? "default" : "outline"}
                size="sm"
                onClick={() => setDirection("INCOMING")}
              >
                Surat Masuk
              </Button>
              <Button
                type="button"
                variant={!isIncoming ? "default" : "outline"}
                size="sm"
                onClick={() => setDirection("OUTGOING")}
              >
                Surat Keluar
              </Button>
            </div>
          </div>

          {isIncoming && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="m-sender">Pengirim Eksternal</Label>
              <Input
                id="m-sender"
                value={externalSender}
                onChange={(e) => setExternalSender(e.target.value)}
                placeholder="Mis. Universitas Brawijaya, Kemendikbud, BNI Pusat"
                required
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Nama instansi atau perorangan asal surat. Wajib diisi.
              </p>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="m-number">
              {isIncoming
                ? "Nomor Surat (sesuai surat asli)"
                : "Nomor Surat (manual, opsional)"}
            </Label>
            <Input
              id="m-number"
              value={manualNumber}
              placeholder={
                isIncoming
                  ? "Mis. 123/A.1/UND/IV/2026"
                  : "Kosongkan untuk membuat nomor baru otomatis"
              }
              onChange={(e) => setManualNumber(e.target.value)}
              required={isIncoming}
            />
            {isIncoming && (
              <p className="text-[11px] text-muted-foreground">
                Salin persis nomor yang tertera di surat aslinya.
              </p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="m-subject">Perihal</Label>
            <Input id="m-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-date">Tanggal Surat</Label>
            <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2 sm:col-span-2 sm:order-none">
            <Label htmlFor="m-recipient">
              {isIncoming ? "Diteruskan ke (Pejabat / Unit Internal)" : "Tujuan"}
            </Label>
            <Input
              id="m-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              required
              placeholder={
                isIncoming
                  ? "Mis. Wakil Rektor I, Bagian Akademik"
                  : "Nama / instansi penerima"
              }
            />
            {isIncoming && (
              <p className="text-[11px] text-muted-foreground">
                Pre-filled ke akun Anda. Ubah bila surat ditujukan ke pejabat lain.
              </p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2 rounded-md border bg-muted/30 p-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Klasifikasi
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-unit" className="text-xs">
                  {isIncoming ? "Unit Penerima Internal" : "Unit"}
                </Label>
                <Select value={unitId} onValueChange={setUnitId} disabled={!canChooseUnit}>
                  <SelectTrigger id="m-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.code} &mdash; {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isIncoming && !canChooseUnit && (
                  <p className="text-[11px] text-muted-foreground">
                    Otomatis ke unit Anda. Surat masuk akan masuk ke buku arsip unit ini.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-type" className="text-xs">
                  Jenis Surat
                </Label>
                <Select value={letterTypeId} onValueChange={setLetterTypeId}>
                  <SelectTrigger id="m-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {letterTypes.map((lt) => (
                      <SelectItem key={lt.id} value={lt.id}>
                        {lt.code} &mdash; {lt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isIncoming && (
                  <p className="text-[11px] text-muted-foreground">
                    Pilih yang paling mendekati. Bila tidak yakin, pakai default.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="m-file">Bukti / Lampiran (opsional)</Label>
            <input
              id="m-file"
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length === 0) return;
                setError(null);
                setFiles((prev) => {
                  const next = [...prev, ...picked];
                  const imgs = next.filter(isImageFile).length;
                  const others = next.length - imgs;
                  if (imgs > 0 && others > 0) {
                    setError(
                      "Tidak bisa mencampur foto dan PDF/Word. Pilih semua foto, atau satu file PDF."
                    );
                    return prev;
                  }
                  if (others > 1) {
                    setError("Hanya satu file PDF/Word yang dapat diunggah.");
                    return prev;
                  }
                  return next;
                });
                e.target.value = "";
              }}
              className="block w-full text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            {files.length > 0 && (
              <ul className="space-y-1 rounded-md border p-2 text-xs">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {i + 1}. {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Hapus ${f.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {files.filter(isImageFile).length >= 2 && (
              <p className="rounded-md bg-primary/10 px-2 py-1 text-[11px] text-primary">
                {files.filter(isImageFile).length} foto akan digabung jadi 1 PDF saat disimpan.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Pilih beberapa foto sekaligus untuk surat multi-halaman, atau satu file PDF/Word.
              Bila kosong, arsip berstatus <em>Menunggu Bukti</em>; bila ada lampiran, langsung <em>Terbit</em>.
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
