"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileUp, Sparkles, CheckCircle2, AlertCircle, Camera, FileSignature } from "lucide-react";
import {
  uploadProofAsset,
  assetToProofBody,
  UploadError,
  BLOB_MAX_BYTES,
} from "@/lib/upload-client";
import { splitTemplate } from "@/lib/format";
import { pad3 } from "@/lib/utils";

interface UnitOption {
  id: string;
  code: string;
  name: string;
  formatTemplate: string;
  // Optional: ids of UNIT_SPECIFIC letter types this unit is allowlisted for
  // (TechSpec 3.1). When present we filter the dropdown so only GLOBAL +
  // allowlisted types appear when this unit is selected.
  allowedLetterTypeIds?: string[];
}

type LetterTypeOption = {
  id: string;
  code: string;
  name: string;
  // Optional for backward-compat: missing = treat as GLOBAL.
  scope?: "GLOBAL" | "UNIT_SPECIFIC";
};

interface GenerateFormProps {
  units: UnitOption[];
  letterTypes: LetterTypeOption[];
  defaultUnitId: string;
  isUser: boolean;
  sessionUserId: string;
}

interface AllocatedArchive {
  id: string;
  number: string;
  subject: string;
  status: string;
  fileName: string | null;
  fileDataUrl: string | null;
}

export function GenerateForm({
  units,
  letterTypes,
  defaultUnitId,
  isUser,
  sessionUserId,
}: GenerateFormProps) {
  const router = useRouter();
  const [unitId, setUnitId] = useState<string>(defaultUnitId);
  const [letterTypeId, setLetterTypeId] = useState<string>(letterTypes[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [previewSeq, setPreviewSeq] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allocated, setAllocated] = useState<AllocatedArchive | null>(null);

  // Surat Sisipan / manual override (does NOT increment the counter).
  const [isInsert, setIsInsert] = useState(false);
  const [manualNo, setManualNo] = useState("");
  // Tanggal Surat — only meaningful for surat sisipan / backdate. Stored as a
  // YYYY-MM-DD string from the <input type="date"> element.
  const today = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);
  const [letterDate, setLetterDate] = useState<string>(today);
  // Alasan sisipan — wajib diisi minimal 5 karakter saat isInsert=true.
  // Tersimpan ke Archive.insertReason untuk audit trail.
  const [insertReason, setInsertReason] = useState<string>("");

  // Proof-upload state (shown after allocation)
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const needsProof = allocated?.status === "PENDING_PROOF";
  const isPdf = useMemo(() => proofFile?.type === "application/pdf", [proofFile]);

  const selectedUnit = useMemo(() => units.find((u) => u.id === unitId), [units, unitId]);

  // TechSpec 3.1: dropdown shows only GLOBAL letter types + the UNIT_SPECIFIC
  // ones explicitly allowlisted for the currently-selected unit.
  const visibleLetterTypes = useMemo<LetterTypeOption[]>(() => {
    const allowed = new Set(selectedUnit?.allowedLetterTypeIds ?? []);
    return letterTypes.filter(
      (lt) => (lt.scope ?? "GLOBAL") === "GLOBAL" || allowed.has(lt.id)
    );
  }, [letterTypes, selectedUnit]);

  // Reset the letter-type selection if it disappears after the user changes
  // unit (e.g. moving from a faculty that has "SKR" to one that doesn't).
  useEffect(() => {
    if (visibleLetterTypes.length === 0) {
      if (letterTypeId) setLetterTypeId("");
      return;
    }
    if (!visibleLetterTypes.some((lt) => lt.id === letterTypeId)) {
      setLetterTypeId(visibleLetterTypes[0].id);
    }
  }, [visibleLetterTypes, letterTypeId]);

  const selectedLetterType = useMemo(
    () => visibleLetterTypes.find((lt) => lt.id === letterTypeId),
    [visibleLetterTypes, letterTypeId]
  );

  // Split the unit's template into the static prefix/suffix around [NO].
  // For surat sisipan we use the user-entered Tanggal Surat (so a March
  // backdate filed in April still renders "III/2026" in the number); for the
  // normal allocation flow we use the current date because that path is
  // server-rendered with `now()` anyway.
  const templateSplit = useMemo(() => {
    if (!selectedUnit || !selectedLetterType) return { prefix: "…", suffix: "" };
    let monthYear: { month: number; year: number };
    if (isInsert && letterDate) {
      const [y, m] = letterDate.split("-").map((n) => parseInt(n, 10));
      if (Number.isFinite(y) && Number.isFinite(m)) {
        monthYear = { month: m, year: y };
      } else {
        const now = new Date();
        monthYear = { month: now.getMonth() + 1, year: now.getFullYear() };
      }
    } else {
      const now = new Date();
      monthYear = { month: now.getMonth() + 1, year: now.getFullYear() };
    }
    return splitTemplate(selectedUnit.formatTemplate, {
      unitCode: selectedUnit.code,
      letterTypeCode: selectedLetterType.code,
      month: monthYear.month,
      year: monthYear.year,
    });
  }, [selectedUnit, selectedLetterType, isInsert, letterDate]);

  useEffect(() => {
    if (allocated) return; // don't refresh preview while in proof step
    if (isInsert) return; // sisipan ignores auto-preview
    let cancelled = false;
    async function loadPreview() {
      if (!unitId || !letterTypeId) {
        setPreviewSeq(null);
        setPreviewError(null);
        return;
      }
      setLoadingPreview(true);
      setPreviewError(null);
      try {
        const res = await fetch("/api/numbering/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitId, letterTypeId }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.preview) {
          setPreviewSeq(data.preview.sequenceNumber ?? null);
        } else {
          setPreviewSeq(null);
          setPreviewError(
            data?.error ||
              (res.status === 404
                ? "Jenis surat ini tidak tersedia untuk unit Anda. Pilih jenis lain."
                : "Gagal memuat pratinjau nomor. Coba ganti jenis surat atau muat ulang.")
          );
        }
      } catch {
        if (!cancelled) {
          setPreviewSeq(null);
          setPreviewError("Tidak dapat terhubung ke server. Periksa koneksi.");
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [unitId, letterTypeId, allocated, isInsert]);

  const previewNumber = useMemo(() => {
    if (previewSeq == null) return null;
    return `${templateSplit.prefix}${pad3(previewSeq)}${templateSplit.suffix}`;
  }, [previewSeq, templateSplit]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isInsert) {
      const trimmed = manualNo.trim();
      if (!trimmed) {
        setError("Nomor sisipan wajib diisi (mis. 024.1 atau 024.A).");
        return;
      }
      if (!/^[0-9]/.test(trimmed)) {
        setError("Nomor sisipan harus diawali angka.");
        return;
      }
      if (insertReason.trim().length < 5) {
        setError("Alasan sisipan wajib diisi (minimal 5 karakter).");
        return;
      }
    }
    setSubmitting(true);
    try {
      const manualNumber = isInsert
        ? `${templateSplit.prefix}${manualNo.trim()}${templateSplit.suffix}`
        : undefined;
      // For surat sisipan the user-entered Tanggal Surat IS the letter date;
      // for the regular allocation flow we leave `date` out so the server
      // stamps it with the allocation moment.
      const res = await fetch("/api/archives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          letterTypeId,
          subject,
          recipient,
          direction: "OUTGOING",
          manualNumber,
          date: isInsert ? letterDate : undefined,
          isInsert: isInsert || undefined,
          insertReason: isInsert ? insertReason.trim() : undefined,
        }),
      });
      // The server may return non-JSON in failure modes (e.g. a Vercel timeout
      // page or a Next.js HTML error page when an unhandled exception bubbles
      // up). Read raw text first so we can surface a useful diagnostic instead
      // of swallowing the failure as "kesalahan jaringan".
      const rawText = await res.text();
      let data: { archive?: AllocatedArchive; error?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        // eslint-disable-next-line no-console
        console.error("[generate] non-JSON response", res.status, rawText.slice(0, 500));
        setError(
          `Server mengembalikan respons tidak valid (HTTP ${res.status}). Coba ulang atau hubungi superadmin.`
        );
        return;
      }
      if (!res.ok) {
        setError(data.error || `Gagal membuat nomor surat (HTTP ${res.status})`);
        return;
      }
      if (!data.archive) {
        setError("Server mengembalikan data tidak lengkap. Coba ulang.");
        return;
      }
      setAllocated({
        id: data.archive.id,
        number: data.archive.number,
        subject: data.archive.subject,
        status: data.archive.status,
        fileName: data.archive.fileName,
        fileDataUrl: data.archive.fileDataUrl,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[generate] fetch failed", e);
      setError(
        e instanceof Error
          ? `Terjadi kesalahan jaringan: ${e.message}`
          : "Terjadi kesalahan jaringan"
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(file: File | null) {
    setUploadError(null);
    setProofFile(file);
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    if (!file) {
      setProofPreviewUrl(null);
      return;
    }
    if (file.size > BLOB_MAX_BYTES) {
      setUploadError("Ukuran file melebihi 5MB. Mohon perkecil atau kompres foto.");
      setProofFile(null);
      setProofPreviewUrl(null);
      return;
    }
    if (file.type.startsWith("image/")) {
      setProofPreviewUrl(URL.createObjectURL(file));
    } else {
      setProofPreviewUrl(null);
    }
  }

  async function uploadProof() {
    if (!allocated || !proofFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const asset = await uploadProofAsset(sessionUserId, proofFile);
      const res = await fetch(`/api/archives/${allocated.id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetToProofBody(asset)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.error || "Gagal mengunggah bukti");
        return;
      }
      setAllocated({
        id: data.archive.id,
        number: data.archive.number,
        subject: data.archive.subject,
        status: data.archive.status,
        fileName: data.archive.fileName,
        fileDataUrl: data.archive.fileDataUrl,
      });
      router.refresh();
    } catch (e) {
      if (e instanceof UploadError) {
        setUploadError(e.message);
      } else {
        setUploadError("Gagal memproses file. Periksa koneksi dan coba lagi.");
      }
    } finally {
      setUploading(false);
    }
  }

  function resetForm() {
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setAllocated(null);
    setProofFile(null);
    setProofPreviewUrl(null);
    setSubject("");
    setRecipient("");
    setError(null);
    setUploadError(null);
    // Reset sisipan state too — the next submission must reflect a fresh
    // override decision + justification, not silently reuse the previous
    // one. Audit-trail correctness depends on this.
    setIsInsert(false);
    setManualNo("");
    setInsertReason("");
    setLetterDate(today);
  }

  if (allocated) {
    const isIssued = allocated.status === "ISSUED";
    return (
      <div className="space-y-5">
        <div
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            isIssued
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
              : "border-amber-500/40 bg-amber-500/10 text-amber-800"
          }`}
        >
          {isIssued ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">
              {isIssued
                ? "Surat berhasil diarsipkan dan disertai bukti."
                : isUser
                ? `Draf diajukan dengan nomor tentatif ${allocated.number}.`
                : "Nomor berhasil dialokasikan. Unggah bukti surat untuk menyelesaikan arsip."}
            </p>
            <p>
              <span className="font-medium">Nomor:</span>{" "}
              <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-xs">
                {allocated.number}
              </code>
              {"  "}
              <span className="font-medium">Perihal:</span> {allocated.subject}
            </p>
            <p className="text-xs opacity-80">
              Status: <span className="font-semibold">{allocated.status}</span>
            </p>
          </div>
        </div>

        {needsProof && (
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Unggah Bukti Surat</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Ambil foto atau unggah scan surat yang sudah ditandatangani. File gambar (PNG/JPG/WEBP) atau PDF,
              maksimal 5MB.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label
                htmlFor="proof"
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent sm:w-auto"
              >
                <FileUp className="h-4 w-4" />
                Pilih / Ambil Foto
              </label>
              <input
                id="proof"
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
              <span className="text-sm text-muted-foreground">
                {proofFile ? proofFile.name : "Belum ada file"}
              </span>
            </div>

            {proofPreviewUrl && (
              <div className="overflow-hidden rounded-md border">
                <Image
                  src={proofPreviewUrl}
                  alt="Pratinjau bukti"
                  width={600}
                  height={400}
                  unoptimized
                  className="max-h-64 w-auto object-contain"
                />
              </div>
            )}
            {proofFile && isPdf && (
              <p className="text-xs text-muted-foreground">File PDF terpilih: {proofFile.name}</p>
            )}

            {uploadError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {uploadError}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={uploadProof} disabled={!proofFile || uploading}>
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                Unggah Bukti & Selesaikan
              </Button>
              <Button variant="outline" type="button" onClick={resetForm}>
                Kembali ke Form
              </Button>
              <Button variant="ghost" type="button" asChild>
                <Link href="/dashboard/archives">Lihat Daftar Arsip</Link>
              </Button>
            </div>
          </div>
        )}

        {!needsProof && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={resetForm}>
              {isUser ? "Ajukan Draf Lagi" : "Buat Nomor Lagi"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/archives">Lihat Arsip</Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="unit">Unit Penerbit</Label>
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger id="unit">
            <SelectValue placeholder="Pilih unit" />
          </SelectTrigger>
          <SelectContent>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.code} — {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">Jenis Surat</Label>
        <Select value={letterTypeId} onValueChange={setLetterTypeId}>
          <SelectTrigger id="type">
            <SelectValue placeholder="Pilih jenis surat" />
          </SelectTrigger>
          <SelectContent>
            {visibleLetterTypes.map((lt) => (
              <SelectItem key={lt.id} value={lt.id}>
                {lt.code} — {lt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="md:col-span-2 space-y-2">
        <div className="flex items-start gap-2 rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <input
            id="is-insert"
            type="checkbox"
            checked={isInsert}
            onChange={(e) => {
              setIsInsert(e.target.checked);
              if (!e.target.checked) setManualNo("");
            }}
            className="mt-0.5 h-4 w-4 cursor-pointer"
          />
          <Label htmlFor="is-insert" className="flex-1 cursor-pointer text-xs font-normal text-amber-900">
            <span className="flex items-center gap-1.5 font-semibold">
              <FileSignature className="h-3.5 w-3.5" />
              Buat Surat Sisipan (manual override / backdate)
            </span>
            <span className="mt-0.5 block">
              Centang bila Anda perlu mengeluarkan nomor di luar urutan otomatis (mis. surat backdate
              dengan format <span className="font-mono">024.1</span> atau <span className="font-mono">024.A</span>). Nomor sisipan tidak akan memajukan
              counter penomoran utama.
            </span>
          </Label>
        </div>

        {isInsert && (
          <div className="space-y-2.5 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-3">
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-900">
              <span aria-hidden className="mt-0.5">⚠️</span>
              <div>
                <strong className="font-semibold">Perhatian:</strong> surat sisipan adalah override
                manual atas nomor otomatis. Setiap penggunaan{" "}
                <strong>tercatat permanen di audit log</strong> beserta alasannya, dan akan terlihat
                oleh superadmin. Gunakan hanya untuk kasus yang benar-benar membutuhkan (misal surat
                backdate karena keterlambatan administratif), bukan untuk menambal nomor yang
                terlewat secara rutin.
              </div>
            </div>

            <div>
              <Label htmlFor="letter-date" className="text-xs font-semibold text-amber-900">
                Tanggal Surat <span className="text-destructive">*</span>
              </Label>
              <Input
                id="letter-date"
                type="date"
                value={letterDate}
                onChange={(e) => setLetterDate(e.target.value)}
                max={today}
                required={isInsert}
                className="mt-1 max-w-xs"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-amber-900/80">
                Bulan Romawi dan tahun di nomor surat akan mengikuti tanggal ini, bukan tanggal
                hari ini.
              </p>
            </div>

            <div>
              <Label htmlFor="insert-reason" className="text-xs font-semibold text-amber-900">
                Alasan Sisipan <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="insert-reason"
                value={insertReason}
                onChange={(e) => setInsertReason(e.target.value)}
                required={isInsert}
                minLength={5}
                maxLength={1000}
                rows={2}
                placeholder="Mis. SK ditandatangani 15 Maret tetapi baru diserahkan ke arsip hari ini."
                className="mt-1 block w-full resize-y rounded-md border border-amber-300 bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-amber-900/80">
                Wajib diisi minimal 5 karakter. Alasan ini akan tersimpan di arsip dan terlihat
                pada audit log + tampilan detail arsip.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {isInsert ? "Format nomor sisipan (hanya kolom angka di bawah yang dapat diketik):" : "Nomor yang akan dihasilkan:"}
          </div>
          <div className="flex flex-wrap items-center gap-1 font-mono text-sm sm:text-base">
            <span className="select-none text-muted-foreground">{templateSplit.prefix || "—"}</span>
            {isInsert ? (
              <input
                type="text"
                value={manualNo}
                onChange={(e) => setManualNo(e.target.value)}
                placeholder="024.1"
                pattern="^[0-9].*$"
                aria-label="Nomor urut sisipan"
                className="w-28 rounded border border-amber-400 bg-background px-2 py-0.5 text-center font-mono text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                autoFocus
              />
            ) : (
              <span className="rounded bg-background px-2 py-0.5 font-semibold">
                {loadingPreview ? "…" : previewSeq != null ? pad3(previewSeq) : "—"}
              </span>
            )}
            <span className="select-none text-muted-foreground">{templateSplit.suffix}</span>
          </div>
          {!isInsert && previewNumber && (
            <p className="mt-2 text-xs text-muted-foreground">
              Pratinjau lengkap: <code className="text-foreground">{previewNumber}</code>
            </p>
          )}
          {!isInsert && previewError && (
            <p className="mt-2 text-xs text-destructive">{previewError}</p>
          )}
          {isInsert && (
            <p className="mt-2 text-xs text-amber-800">
              Counter saat ini berhenti di <span className="font-mono">{previewSeq != null ? pad3(previewSeq - 1) : "—"}</span>;
              setelah surat sisipan ini disimpan, generate berikutnya tetap menjadi{" "}
              <span className="font-mono">{previewSeq != null ? pad3(previewSeq) : "—"}</span>.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="subject">Perihal</Label>
        <Input
          id="subject"
          placeholder="Contoh: Penetapan Panitia Wisuda Semester Genap"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="recipient">Tujuan</Label>
        <Input
          id="recipient"
          placeholder="Contoh: Seluruh Dekan Fakultas"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          required
        />
      </div>

      <div className="md:col-span-2 rounded-md border bg-blue-50/50 px-3 py-2 text-xs text-blue-900">
        Setelah nomor dialokasikan, Anda <strong>wajib mengunggah foto/scan surat</strong> sebagai bukti
        sebelum arsip berstatus <em>ISSUED</em>.
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2">
          {error}
        </div>
      )}

      <div className="md:col-span-2">
        <Button type="submit" disabled={submitting || !unitId || !letterTypeId}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isUser ? "Ajukan Draf ke Admin Unit" : "Alokasikan Nomor"}
        </Button>
      </div>
    </form>
  );
}
