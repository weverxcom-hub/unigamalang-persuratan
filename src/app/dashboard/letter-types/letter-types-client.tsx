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
import type { LetterType } from "@/lib/types";
import { Plus, Pencil, Trash2, Printer } from "lucide-react";

interface Props {
  initialLetterTypes: LetterType[];
}

export function LetterTypesClient({ initialLetterTypes }: Props) {
  const [letterTypes, setLetterTypes] = useState<LetterType[]>(initialLetterTypes);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<LetterType | null>(null);
  const [deleting, setDeleting] = useState<LetterType | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/letter-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase(), name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menambah jenis surat");
        return;
      }
      setLetterTypes((prev) => [...prev, data.letterType]);
      setCode("");
      setName("");
    } finally {
      setLoading(false);
    }
  }

  function onEdited(updated: LetterType) {
    setLetterTypes((prev) => prev.map((lt) => (lt.id === updated.id ? updated : lt)));
  }

  function onDeleted(id: string) {
    setLetterTypes((prev) => prev.filter((lt) => lt.id !== id));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="code">Kode</Label>
          <Input
            id="code"
            placeholder="SK"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nama Jenis Surat</Label>
          <Input
            id="name"
            placeholder="Surat Keputusan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={loading}>
            <Plus className="h-4 w-4" />
            Tambah Jenis
          </Button>
        </div>
        {error && (
          <div className="col-span-full rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </form>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{letterTypes.length} jenis surat aktif</p>
        <Button variant="outline" size="sm" asChild>
          <a href="/print/letter-types" target="_blank" rel="noreferrer">
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
              <TableHead>Nama</TableHead>
              <TableHead className="w-[180px]">Dibuat</TableHead>
              <TableHead className="w-[150px] text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {letterTypes.map((lt) => (
              <TableRow key={lt.id}>
                <TableCell>
                  <Badge variant="outline">{lt.code}</Badge>
                </TableCell>
                <TableCell className="font-medium">{lt.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(lt.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(lt)}
                    aria-label={`Edit ${lt.code}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(lt)}
                    aria-label={`Hapus ${lt.code}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {letterTypes.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada jenis surat. Tambahkan menggunakan form di atas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EditDialog
          letterType={editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            onEdited(u);
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          letterType={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            onDeleted(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  letterType,
  onClose,
  onSaved,
}: {
  letterType: LetterType;
  onClose: () => void;
  onSaved: (lt: LetterType) => void;
}) {
  const [code, setCode] = useState(letterType.code);
  const [name, setName] = useState(letterType.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/letter-types/${letterType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase(), name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan perubahan");
        return;
      }
      onSaved(data.letterType);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Jenis Surat</DialogTitle>
          <DialogDescription>
            Ubah kode atau nama jenis surat. Kode yang sudah dipakai pada arsip lama tetap
            tertulis pada nomor surat tersebut.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-code">Kode</Label>
            <Input
              id="edit-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nama</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
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
  letterType,
  onClose,
  onDeleted,
}: {
  letterType: LetterType;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/letter-types/${letterType.id}`, { method: "DELETE" });
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
          <DialogTitle>Hapus jenis surat?</DialogTitle>
          <DialogDescription>
            Jenis <strong>{letterType.code}</strong> ({letterType.name}) akan dinonaktifkan dan
            tidak muncul saat membuat surat baru. Arsip lama yang sudah memakai kode ini tetap
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
