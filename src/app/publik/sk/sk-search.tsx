"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";

type UnitOption = { id: string; code: string; name: string };

type SkResult = {
  id: string;
  source: "legacy" | "archive";
  nomor: string;
  tanggal: string | null;
  perihal: string;
  unitCode: string | null;
  unitName: string | null;
  jenis: string;
  isComplete: boolean;
  catatan: string | null;
  sourceLink: string | null;
};

type ApiResponse = {
  results: SkResult[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

function formatTanggal(iso: string | null): string {
  if (!iso) return "Tanggal tidak diketahui";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

const ALL_UNITS = "__all__";
const ALL_YEARS = "__all__";

export function SkSearch({ units }: { units: UnitOption[] }) {
  const [q, setQ] = useState("");
  const [unitId, setUnitId] = useState<string>(ALL_UNITS);
  const [year, setYear] = useState<string>(ALL_YEARS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current; y >= 1987; y--) list.push(y);
    return list;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (unitId !== ALL_UNITS) params.set("unitId", unitId);
      if (year !== ALL_YEARS) params.set("year", year);
      params.set("page", String(page));

      fetch(`/api/publik/sk?${params.toString()}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("Gagal memuat data");
          return res.json();
        })
        .then((json: ApiResponse) => setData(json))
        .catch((err) => {
          if (err.name !== "AbortError") setError("Gagal memuat data. Coba lagi.");
        })
        .finally(() => setLoading(false));
    }, 300); // debounce

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [q, unitId, year, page]);

  // Any filter change resets to page 1.
  useEffect(() => {
    setPage(1);
  }, [q, unitId, year]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          placeholder="Cari perihal atau nomor SK..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:col-span-1"
        />
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger>
            <SelectValue placeholder="Semua unit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_UNITS}>Semua unit</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger>
            <SelectValue placeholder="Semua tahun" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_YEARS}>Semua tahun</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && !data ? (
        <TableSkeleton rows={6} columns={5} />
      ) : data && data.results.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Tidak ada SK/SE yang cocok dengan pencarian ini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Perihal</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.results.map((r) => (
                <TableRow key={`${r.source}-${r.id}`}>
                  <TableCell className="font-mono text-xs">
                    {r.nomor || <span className="italic text-muted-foreground">(tidak ada nomor)</span>}
                    <Badge variant="outline" className="ml-2 align-middle">
                      {r.jenis}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md">
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
                      r.perihal
                    )}
                    {r.catatan && (
                      <p className="mt-1 text-xs text-muted-foreground">Catatan: {r.catatan}</p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.unitName ?? r.unitCode ?? "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatTanggal(r.tanggal)}</TableCell>
                  <TableCell>
                    {r.isComplete ? (
                      <Badge variant="success">Terverifikasi</Badge>
                    ) : (
                      <Badge variant="warning">Belum terverifikasi</Badge>
                    )}
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
