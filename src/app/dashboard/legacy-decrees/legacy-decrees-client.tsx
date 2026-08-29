"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";

type ImportResult = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  hiddenCount: number;
};

// One-click trigger for src/lib/legacy-import.ts, run server-side (see
// that route's comment for why: production's DATABASE_URL can't be read
// out of Vercel to run the equivalent CLI script locally). Safe to click
// more than once — the underlying import is idempotent.
export function ImportButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/legacy-decrees/import", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menjalankan impor");
      setResult(json);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      setState("error");
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col items-start gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Impor / Sinkronkan Data SK BP3M</p>
          <p className="text-sm text-muted-foreground">
            Klik ini sekali untuk mengisi database dengan 325 SK BP3M dan 3 unit yang dibutuhkan
            (Fakultas Sastra, Teknik, Ilmu Komputer). Aman diklik berkali-kali — data yang sudah ada
            tidak akan dobel.
          </p>
          {state === "done" && result && (
            <p className="mt-2 text-sm font-medium text-emerald-600">
              Selesai — {result.total} data diproses ({result.created} baru, {result.updated}{" "}
              diperbarui), {result.hiddenCount} baris disembunyikan otomatis dari publik karena
              menyangkut hal personel/disipliner.
            </p>
          )}
          {state === "error" && error && (
            <p className="mt-2 text-sm font-medium text-destructive">Gagal: {error}</p>
          )}
        </div>
        <Button onClick={run} disabled={state === "loading"} className="shrink-0">
          {state === "loading" ? "Sedang memproses..." : "Jalankan Impor"}
        </Button>
      </CardContent>
    </Card>
  );
}

type Row = {
  id: string;
  noUrutAsli: number;
  nomor: string;
  tanggal: string | null;
  tanggalRaw: string;
  perihal: string;
  unitCode: string | null;
  unitName: string | null;
  jenis: string;
  isComplete: boolean;
  isPublic: boolean;
  catatan: string | null;
  sourceLink: string | null;
};

type ApiResponse = {
  rows: Row[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  hiddenCount: number;
};

const FILTER_ALL = "__all__";
const FILTER_HIDDEN = "false";
const FILTER_PUBLIC = "true";

export function LegacyDecreesClient() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>(FILTER_HIDDEN); // default: show what needs review first
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (filter !== FILTER_ALL) params.set("isPublic", filter);
    params.set("page", String(page));

    fetch(`/api/legacy-decrees?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Gagal memuat data");
        return res.json();
      })
      .then((json: ApiResponse) => setData(json))
      .catch(() => setError("Gagal memuat data. Coba lagi."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, page]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter]);

  async function toggle(row: Row) {
    setPendingId(row.id);
    const nextIsPublic = !row.isPublic;
    try {
      const res = await fetch(`/api/legacy-decrees/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: nextIsPublic }),
      });
      if (!res.ok) throw new Error();
      // Optimistic-ish: just refetch current view so filtered-out rows
      // (e.g. toggling a "hidden" row to public while filter=hidden)
      // disappear from the list correctly instead of lying about state.
      load();
    } catch {
      setError("Gagal mengubah status. Coba lagi.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          placeholder="Cari perihal atau nomor..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_HIDDEN}>Perlu ditinjau (disembunyikan)</SelectItem>
            <SelectItem value={FILTER_PUBLIC}>Sudah publik</SelectItem>
            <SelectItem value={FILTER_ALL}>Semua</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && !data ? (
        <TableSkeleton rows={6} columns={5} />
      ) : data && data.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter === FILTER_HIDDEN
            ? "Tidak ada baris yang disembunyikan — semua sudah ditinjau."
            : "Tidak ada hasil."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Perihal</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status Publik</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{r.noUrutAsli}</TableCell>
                  <TableCell className="max-w-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.nomor || "(kosong)"}</span>
                      <Badge variant="outline">{r.jenis}</Badge>
                    </div>
                    {r.sourceLink ? (
                      <a
                        href={r.sourceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {r.perihal}
                      </a>
                    ) : (
                      <span>{r.perihal}</span>
                    )}
                    {r.catatan && (
                      <p className="mt-1 text-xs text-muted-foreground">Catatan: {r.catatan}</p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.unitName ?? r.unitCode ?? "-"}
                  </TableCell>
                  <TableCell>
                    {r.isPublic ? (
                      <Badge variant="success">Publik</Badge>
                    ) : (
                      <Badge variant="warning">Disembunyikan</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pendingId === r.id}
                      onClick={() => toggle(r)}
                    >
                      {r.isPublic ? "Sembunyikan" : "Tampilkan ke publik"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Halaman {data.pagination.page} dari {data.pagination.totalPages} &middot;{" "}
            {data.pagination.total} hasil
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
