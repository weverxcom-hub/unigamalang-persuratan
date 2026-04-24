"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileUp, Sparkles } from "lucide-react";

interface GenerateFormProps {
  units: { id: string; code: string; name: string }[];
  letterTypes: { id: string; code: string; name: string }[];
  defaultUnitId: string;
  isUser: boolean;
}

export function GenerateForm({ units, letterTypes, defaultUnitId, isUser }: GenerateFormProps) {
  const router = useRouter();
  const [unitId, setUnitId] = useState<string>(defaultUnitId);
  const [letterTypeId, setLetterTypeId] = useState<string>(letterTypes[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      if (!unitId || !letterTypeId) {
        setPreview(null);
        return;
      }
      setLoadingPreview(true);
      try {
        const res = await fetch("/api/numbering/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitId, letterTypeId }),
        });
        const data = await res.json();
        if (!cancelled && res.ok) setPreview(data.preview.number);
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [unitId, letterTypeId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/archives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          letterTypeId,
          subject,
          recipient,
          direction: "OUTGOING",
          fileName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat nomor surat");
        return;
      }
      setSuccess(
        isUser
          ? `Draf terkirim. Nomor tentatif: ${data.archive.number} (menunggu persetujuan Admin Unit).`
          : `Nomor berhasil dialokasikan: ${data.archive.number}`
      );
      setSubject("");
      setRecipient("");
      setFileName(null);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 md:grid-cols-2">
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
            {letterTypes.map((lt) => (
              <SelectItem key={lt.id} value={lt.id}>
                {lt.code} — {lt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="md:col-span-2">
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Nomor yang akan dihasilkan:</span>
          <code className="ml-auto rounded bg-background px-2 py-1 font-mono text-sm font-semibold">
            {loadingPreview ? "Menghitung…" : preview ?? "—"}
          </code>
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
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="file">Lampiran Dokumen (opsional)</Label>
        <div className="flex items-center gap-3">
          <label
            htmlFor="file"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
          >
            <FileUp className="h-4 w-4" />
            Pilih file
          </label>
          <input
            id="file"
            type="file"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <span className="text-sm text-muted-foreground">{fileName ?? "Belum ada file (mock)"}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Pada prototipe ini file tidak diunggah ke penyimpanan, hanya nama file yang tercatat.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 md:col-span-2">
          {success}
        </div>
      )}

      <div className="md:col-span-2">
        <Button type="submit" disabled={submitting || !unitId || !letterTypeId}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isUser ? "Ajukan Draf ke Admin Unit" : "Buat Nomor & Arsipkan"}
        </Button>
      </div>
    </form>
  );
}
