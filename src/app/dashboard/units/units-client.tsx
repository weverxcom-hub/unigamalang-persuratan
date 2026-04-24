"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { Unit } from "@/lib/types";
import { Plus } from "lucide-react";

interface Props {
  initialUnits: Unit[];
}

export function UnitsClient({ initialUnits }: Props) {
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase(), name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menambah unit");
        return;
      }
      setUnits((prev) => [...prev, data.unit]);
      setCode("");
      setName("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="code">Kode Unit</Label>
          <Input
            id="code"
            placeholder="UNIGA"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nama Unit</Label>
          <Input
            id="name"
            placeholder="Rektorat Universitas Gajayana"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={loading}>
            <Plus className="h-4 w-4" />
            Tambah Unit
          </Button>
        </div>
        {error && (
          <div className="col-span-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </form>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Kode</TableHead>
              <TableHead>Nama Unit</TableHead>
              <TableHead className="w-[200px]">Dibuat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Badge variant="outline">{u.code}</Badge>
                </TableCell>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
