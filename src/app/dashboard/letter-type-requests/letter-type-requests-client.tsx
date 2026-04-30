"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { LetterTypeRequest } from "@/lib/types";
import { Send } from "lucide-react";

interface Props {
  initialRequests: LetterTypeRequest[];
}

export function LetterTypeRequestsClient({ initialRequests }: Props) {
  const [requests, setRequests] = useState<LetterTypeRequest[]>(initialRequests);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (reason.trim().length < 10) {
      setError("Alasan pengajuan minimal 10 karakter.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/letter-type-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedCode: code.toUpperCase(),
          proposedName: name,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal mengirim pengajuan");
        return;
      }
      setRequests((prev) => [data.request, ...prev]);
      setCode("");
      setName("");
      setReason("");
      setSuccess(
        "Pengajuan terkirim. Superadmin akan meninjau dan kode akan tersedia untuk unit Anda jika disetujui."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4 rounded-md border bg-muted/30 p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            <Label htmlFor="req-code">Kode</Label>
            <Input
              id="req-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SKR"
              required
              maxLength={10}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="req-name">Nama Jenis Surat</Label>
            <Input
              id="req-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Surat Keterangan Riset"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="req-reason">
            Alasan / kebutuhan <span className="text-destructive">*</span>
          </Label>
          <textarea
            id="req-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Jelaskan kenapa unit Anda butuh jenis ini, dan kenapa jenis Global yang sudah ada belum cukup."
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
          />
          <p className="text-xs text-muted-foreground">
            Minimal 10 karakter. Superadmin akan membaca alasan ini untuk menyetujui atau menolak.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {success}
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={loading}>
            <Send className="h-4 w-4" />
            {loading ? "Mengirim…" : "Kirim Pengajuan"}
          </Button>
        </div>
      </form>

      <div className="rounded-md border">
        <div className="border-b bg-muted/30 px-4 py-2.5 text-sm font-medium">Riwayat Pengajuan</div>
        {requests.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Belum ada pengajuan dari unit Anda.
          </p>
        ) : (
          <div className="divide-y">
            {requests.map((r) => (
              <div key={r.id} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{r.proposedCode}</Badge>
                  <span className="text-sm font-medium">{r.proposedName}</span>
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-muted-foreground">
                    diajukan {formatDate(r.createdAt)}
                  </span>
                </div>
                <p className="rounded-md bg-muted/40 px-3 py-2 text-xs">{r.reason}</p>
                {r.status === "REJECTED" && r.reviewNote && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Alasan penolakan: {r.reviewNote}
                  </p>
                )}
                {r.status === "APPROVED" && r.reviewNote && (
                  <p className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                    Catatan superadmin: {r.reviewNote}
                  </p>
                )}
                {r.status === "APPROVED" && (
                  <p className="text-xs text-muted-foreground">
                    Tersedia di halaman penomoran untuk unit Anda.
                  </p>
                )}
                {r.reviewedBy && (
                  <p className="text-[11px] text-muted-foreground">
                    Ditinjau oleh {r.reviewedBy.name}
                    {r.reviewedAt ? ` · ${formatDate(r.reviewedAt)}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LetterTypeRequest["status"] }) {
  if (status === "APPROVED") return <Badge variant="success">Disetujui</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">Ditolak</Badge>;
  return <Badge variant="warning">Menunggu</Badge>;
}
