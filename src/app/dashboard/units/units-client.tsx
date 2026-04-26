"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { Unit } from "@/lib/types";
import { Plus, Pencil, Trash2, Printer, RotateCcw } from "lucide-react";

interface Props {
  initialUnits: Unit[];
  initialInactive?: Unit[];
}

const DEFAULT_TEMPLATE = "[NO]/[UNIT_CODE]/[TYPE_CODE]/[ROMAN_MONTH]/[YEAR]";

export function UnitsClient({ initialUnits, initialInactive = [] }: Props) {
  const [units, setUnits] = useState<Unit[]>(initialUnits);
  const [inactive, setInactive] = useState<Unit[]>(initialInactive);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [formatTemplate, setFormatTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [deleting, setDeleting] = useState<Unit | null>(null);

  async function reactivate(u: Unit) {
    if (!confirm(`Aktifkan kembali unit ${u.code} (${u.name})?`)) return;
    const res = await fetch(`/api/units/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactivate: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Gagal mengaktifkan kembali");
      return;
    }
    setInactive((prev) => prev.filter((x) => x.id !== u.id));
    setUnits((prev) => [...prev, data.unit].sort((a, b) => a.code.localeCompare(b.code)));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.toUpperCase(),
          name,
          formatTemplate: formatTemplate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menambah unit");
        return;
      }
      setUnits((prev) => [...prev, data.unit]);
      setCode("");
      setName("");
      setFormatTemplate("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
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
        <div className="md:col-span-3 space-y-2">
          <Label htmlFor="format">
            Template Nomor (opsional, default: <code className="text-xs">{DEFAULT_TEMPLATE}</code>)
          </Label>
          <Input
            id="format"
            placeholder={DEFAULT_TEMPLATE}
            value={formatTemplate}
            onChange={(e) => setFormatTemplate(e.target.value)}
          />
        </div>
        {error && (
          <div className="col-span-full rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </form>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{units.length} unit aktif</p>
        <Button variant="outline" size="sm" asChild>
          <a href="/print/units" target="_blank" rel="noreferrer">
            <Printer className="h-4 w-4" />
            Cetak Daftar
          </a>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Kode</TableHead>
              <TableHead>Nama Unit</TableHead>
              <TableHead className="hidden lg:table-cell">Template Nomor</TableHead>
              <TableHead className="w-[160px]">Dibuat</TableHead>
              <TableHead className="w-[150px] text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Badge variant="outline">{u.code}</Badge>
                </TableCell>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                  {u.formatTemplate}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(u.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(u)}
                    aria-label={`Edit ${u.code}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(u)}
                    aria-label={`Hapus ${u.code}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {units.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada unit. Tambahkan menggunakan form di atas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {inactive.length > 0 && (
        <details className="rounded-md border bg-muted/30">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            Unit dinonaktifkan ({inactive.length})
          </summary>
          <div className="divide-y">
            {inactive.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              >
                <div className="flex flex-1 items-center gap-3">
                  <Badge variant="outline">{u.code}</Badge>
                  <span className="text-muted-foreground">{u.name}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => reactivate(u)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Aktifkan kembali
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}

      {editing && (
        <EditDialog
          unit={editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setUnits((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          unit={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setUnits((prev) => prev.filter((x) => x.id !== deleting.id));
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  unit,
  onClose,
  onSaved,
}: {
  unit: Unit;
  onClose: () => void;
  onSaved: (u: Unit) => void;
}) {
  const [code, setCode] = useState(unit.code);
  const [name, setName] = useState(unit.name);
  const [formatTemplate, setFormatTemplate] = useState(unit.formatTemplate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase(), name, formatTemplate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan perubahan");
        return;
      }
      onSaved(data.unit);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Unit</DialogTitle>
          <DialogDescription>
            Ubah kode, nama, atau template nomor unit ini. Arsip lama tetap memakai nomor yang
            sudah dialokasikan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-unit-code">Kode</Label>
            <Input
              id="edit-unit-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-unit-name">Nama</Label>
            <Input
              id="edit-unit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-unit-template">Template Nomor</Label>
            <Input
              id="edit-unit-template"
              value={formatTemplate}
              onChange={(e) => setFormatTemplate(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Placeholder: <code>[NO]</code>, <code>[UNIT_CODE]</code>, <code>[TYPE_CODE]</code>,{" "}
              <code>[ROMAN_MONTH]</code>, <code>[MONTH]</code>, <code>[YEAR]</code>
            </p>
          </div>
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  unit,
  onClose,
  onDeleted,
}: {
  unit: Unit;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/units/${unit.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Gagal menghapus");
        return;
      }
      onDeleted();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus unit?</DialogTitle>
          <DialogDescription>
            Unit <strong>{unit.code}</strong> ({unit.name}) akan dinonaktifkan. Pengguna pada unit
            ini akan kehilangan keanggotaan unit-nya. Arsip yang sudah memakai unit ini tetap
            tersimpan.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Menghapus…" : "Hapus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
