"use client";
import { useMemo, useState } from "react";
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
import type { LetterType, LetterTypeRequest } from "@/lib/types";
import { Plus, Pencil, Trash2, Printer, RotateCcw, Check, X, Inbox } from "lucide-react";

interface UnitOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  initialLetterTypes: LetterType[];
  initialInactive?: LetterType[];
  units: UnitOption[];
  initialPendingRequests?: LetterTypeRequest[];
}

export function LetterTypesClient({
  initialLetterTypes,
  initialInactive = [],
  units,
  initialPendingRequests = [],
}: Props) {
  const [letterTypes, setLetterTypes] = useState<LetterType[]>(initialLetterTypes);
  const [inactive, setInactive] = useState<LetterType[]>(initialInactive);
  const [pendingRequests, setPendingRequests] =
    useState<LetterTypeRequest[]>(initialPendingRequests);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"GLOBAL" | "UNIT_SPECIFIC">("GLOBAL");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<LetterType | null>(null);
  const [deleting, setDeleting] = useState<LetterType | null>(null);
  const [reviewing, setReviewing] = useState<LetterTypeRequest | null>(null);

  const unitsById = useMemo(
    () => new Map(units.map((u) => [u.id, u])),
    [units]
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (scope === "UNIT_SPECIFIC" && unitIds.length === 0) {
      setError("Pilih minimal satu unit untuk jenis surat per-unit.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/letter-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.toUpperCase(),
          name,
          scope,
          unitIds: scope === "UNIT_SPECIFIC" ? unitIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menambah jenis surat");
        return;
      }
      setLetterTypes((prev) =>
        [...prev, data.letterType].sort((a, b) => a.code.localeCompare(b.code))
      );
      setCode("");
      setName("");
      setScope("GLOBAL");
      setUnitIds([]);
    } finally {
      setLoading(false);
    }
  }

  function onEdited(updated: LetterType) {
    setLetterTypes((prev) =>
      prev
        .map((lt) => (lt.id === updated.id ? updated : lt))
        .sort((a, b) => a.code.localeCompare(b.code))
    );
  }

  function onDeleted(id: string) {
    setLetterTypes((prev) => prev.filter((lt) => lt.id !== id));
  }

  async function reactivate(lt: LetterType) {
    if (!confirm(`Aktifkan kembali jenis surat ${lt.code} (${lt.name})?`)) return;
    const res = await fetch(`/api/letter-types/${lt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactivate: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Gagal mengaktifkan kembali");
      return;
    }
    setInactive((prev) => prev.filter((x) => x.id !== lt.id));
    setLetterTypes((prev) =>
      [...prev, data.letterType].sort((a, b) => a.code.localeCompare(b.code))
    );
  }

  function describeAllowedUnits(lt: LetterType): string {
    if (lt.scope !== "UNIT_SPECIFIC") return "Semua unit";
    const ids = lt.allowedUnitIds ?? [];
    if (ids.length === 0) return "—";
    return ids.map((id) => unitsById.get(id)?.code ?? "?").join(", ");
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onCreate}
        className="grid gap-3 rounded-md border bg-muted/30 p-4 md:grid-cols-[160px_1fr_auto]"
      >
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

        <div className="md:col-span-3 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Visibilitas
          </Label>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="scope"
                value="GLOBAL"
                checked={scope === "GLOBAL"}
                onChange={() => setScope("GLOBAL")}
              />
              <span>
                <strong>Global</strong> — muncul di semua unit
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="scope"
                value="UNIT_SPECIFIC"
                checked={scope === "UNIT_SPECIFIC"}
                onChange={() => setScope("UNIT_SPECIFIC")}
              />
              <span>
                <strong>Per Unit</strong> — hanya unit yang dipilih
              </span>
            </label>
          </div>
          {scope === "UNIT_SPECIFIC" && (
            <UnitMultiSelect
              units={units}
              selectedIds={unitIds}
              onChange={setUnitIds}
            />
          )}
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

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead className="w-[120px]">Visibilitas</TableHead>
              <TableHead>Unit Tujuan</TableHead>
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
                <TableCell>
                  {lt.scope === "UNIT_SPECIFIC" ? (
                    <Badge variant="secondary" className="font-normal">
                      Per Unit
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal">
                      Global
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {describeAllowedUnits(lt)}
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
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada jenis surat. Tambahkan menggunakan form di atas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {inactive.length > 0 && (
        <details className="rounded-md border bg-muted/30">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            Jenis surat dinonaktifkan ({inactive.length})
          </summary>
          <div className="divide-y">
            {inactive.map((lt) => (
              <div
                key={lt.id}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              >
                <div className="flex flex-1 items-center gap-3">
                  <Badge variant="outline">{lt.code}</Badge>
                  <span className="text-muted-foreground">{lt.name}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => reactivate(lt)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Aktifkan kembali
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="rounded-md border">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Inbox className="h-4 w-4" />
            Pengajuan Jenis Surat dari Admin Unit
            {pendingRequests.length > 0 && (
              <Badge variant="warning" className="ml-1">
                {pendingRequests.length}
              </Badge>
            )}
          </div>
        </div>
        {pendingRequests.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Tidak ada pengajuan PENDING dari admin unit.
          </p>
        ) : (
          <div className="divide-y">
            {pendingRequests.map((req) => (
              <div key={req.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{req.proposedCode}</Badge>
                    <span className="text-sm font-medium">{req.proposedName}</span>
                    <Badge variant="secondary" className="font-normal">
                      {req.unit.code}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Diminta oleh{" "}
                    <span className="font-medium text-foreground">{req.requestedBy.name}</span>{" "}
                    ({req.requestedBy.email}) · {formatDate(req.createdAt)}
                  </p>
                  <p className="rounded-md bg-muted/40 px-3 py-2 text-xs">{req.reason}</p>
                </div>
                <div className="flex items-center md:items-end">
                  <Button size="sm" onClick={() => setReviewing(req)}>
                    Tinjau
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditDialog
          letterType={editing}
          units={units}
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
            const deleted = deleting;
            onDeleted(deleted.id);
            setInactive((prev) =>
              [...prev, deleted].sort((a, b) => a.code.localeCompare(b.code))
            );
            setDeleting(null);
          }}
        />
      )}
      {reviewing && (
        <ReviewRequestDialog
          request={reviewing}
          units={units}
          onClose={() => setReviewing(null)}
          onResolved={(updated) => {
            // Drop from PENDING list when resolved.
            setPendingRequests((prev) => prev.filter((r) => r.id !== reviewing.id));
            // If approved, optimistically merge the new letter type.
            if (updated && updated.kind === "APPROVE" && updated.letterType) {
              setLetterTypes((prev) =>
                [...prev.filter((lt) => lt.id !== updated.letterType!.id), updated.letterType!]
                  .sort((a, b) => a.code.localeCompare(b.code))
              );
            }
            setReviewing(null);
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
//  Multi-select helper for picking allowed units (used by both create form
//  and edit dialog). Lightweight — we just render a checkbox grid since the
//  Unit count is small (campus-wide).
// -------------------------------------------------------------------------

function UnitMultiSelect({
  units,
  selectedIds,
  onChange,
}: {
  units: UnitOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  }
  return (
    <div className="grid gap-1.5 rounded-md border bg-background p-2 md:grid-cols-2 lg:grid-cols-3">
      {units.map((u) => (
        <label
          key={u.id}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/60"
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(u.id)}
            onChange={() => toggle(u.id)}
          />
          <span className="font-mono text-xs text-muted-foreground">{u.code}</span>
          <span className="truncate">{u.name}</span>
        </label>
      ))}
      {units.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">Tidak ada unit aktif.</p>
      )}
    </div>
  );
}

function EditDialog({
  letterType,
  units,
  onClose,
  onSaved,
}: {
  letterType: LetterType;
  units: UnitOption[];
  onClose: () => void;
  onSaved: (lt: LetterType) => void;
}) {
  const [code, setCode] = useState(letterType.code);
  const [name, setName] = useState(letterType.name);
  const [scope, setScope] = useState<"GLOBAL" | "UNIT_SPECIFIC">(
    letterType.scope ?? "GLOBAL"
  );
  const [unitIds, setUnitIds] = useState<string[]>(letterType.allowedUnitIds ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (scope === "UNIT_SPECIFIC" && unitIds.length === 0) {
      setError("Pilih minimal satu unit untuk jenis surat per-unit.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/letter-types/${letterType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.toUpperCase(),
          name,
          scope,
          allowedUnitIds: scope === "UNIT_SPECIFIC" ? unitIds : [],
        }),
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
            Ubah kode, nama, atau visibilitas jenis surat. Kode yang sudah dipakai pada arsip lama
            tetap tertulis pada nomor surat tersebut.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
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
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Visibilitas
            </Label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="edit-scope"
                  checked={scope === "GLOBAL"}
                  onChange={() => setScope("GLOBAL")}
                />
                <span>
                  <strong>Global</strong> — muncul di semua unit
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="edit-scope"
                  checked={scope === "UNIT_SPECIFIC"}
                  onChange={() => setScope("UNIT_SPECIFIC")}
                />
                <span>
                  <strong>Per Unit</strong>
                </span>
              </label>
            </div>
            {scope === "UNIT_SPECIFIC" && (
              <UnitMultiSelect units={units} selectedIds={unitIds} onChange={setUnitIds} />
            )}
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

function ReviewRequestDialog({
  request,
  units,
  onClose,
  onResolved,
}: {
  request: LetterTypeRequest;
  units: UnitOption[];
  onClose: () => void;
  onResolved: (updated: { kind: "APPROVE" | "REJECT"; letterType?: LetterType } | null) => void;
}) {
  // Approval form state. Default the approval allowlist to the requester's
  // unit so superadmin can one-click approve.
  const [finalCode, setFinalCode] = useState(request.proposedCode);
  const [finalName, setFinalName] = useState(request.proposedName);
  const [allowedUnitIds, setAllowedUnitIds] = useState<string[]>([request.unit.id]);
  const [reviewNote, setReviewNote] = useState("");
  // Reject form state.
  const [rejectNote, setRejectNote] = useState("");
  // UI mode.
  const [mode, setMode] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setError(null);
    if (allowedUnitIds.length === 0) {
      setError("Pilih minimal satu unit yang diizinkan menggunakan jenis ini.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/letter-type-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          finalCode: finalCode.toUpperCase(),
          finalName,
          allowedUnitIds,
          reviewNote: reviewNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyetujui pengajuan");
        return;
      }
      onResolved({
        kind: "APPROVE",
        letterType: data.letterTypeId
          ? {
              id: data.letterTypeId,
              code: finalCode.toUpperCase(),
              name: finalName,
              scope: "UNIT_SPECIFIC",
              allowedUnitIds,
              createdAt: new Date().toISOString(),
            }
          : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  async function onReject() {
    setError(null);
    if (rejectNote.trim().length < 5) {
      setError("Tuliskan alasan penolakan minimal 5 karakter.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/letter-type-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", reviewNote: rejectNote.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menolak pengajuan");
        return;
      }
      onResolved({ kind: "REJECT" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tinjau Pengajuan Jenis Surat</DialogTitle>
          <DialogDescription>
            Pengajuan dari <strong>{request.requestedBy.name}</strong> ({request.unit.code} —{" "}
            {request.unit.name}) untuk kode <code>{request.proposedCode}</code>:{" "}
            {request.proposedName}.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
          <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">Alasan</p>
          <p>{request.reason}</p>
        </div>

        <div className="flex gap-2 rounded-md border p-1">
          <button
            type="button"
            className={`flex-1 rounded px-3 py-1.5 text-sm ${
              mode === "APPROVE" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            onClick={() => setMode("APPROVE")}
          >
            <Check className="mr-1 inline h-3.5 w-3.5" /> Setujui
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-3 py-1.5 text-sm ${
              mode === "REJECT" ? "bg-destructive text-destructive-foreground" : "hover:bg-muted"
            }`}
            onClick={() => setMode("REJECT")}
          >
            <X className="mr-1 inline h-3.5 w-3.5" /> Tolak
          </button>
        </div>

        {mode === "APPROVE" ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="approve-code">Kode Final</Label>
                <Input
                  id="approve-code"
                  value={finalCode}
                  onChange={(e) => setFinalCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="approve-name">Nama Final</Label>
                <Input
                  id="approve-name"
                  value={finalName}
                  onChange={(e) => setFinalName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Unit yang diizinkan menggunakan jenis ini
              </Label>
              <UnitMultiSelect
                units={units}
                selectedIds={allowedUnitIds}
                onChange={setAllowedUnitIds}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="approve-note" className="text-xs">
                Catatan untuk pengaju (opsional)
              </Label>
              <Input
                id="approve-note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Mis. 'disetujui untuk semester ini'"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="reject-note">
              Alasan penolakan <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Mis. kode bentrok dengan jenis lain, atau perlu menggunakan jenis Global yang sudah ada"
            />
            <p className="text-xs text-muted-foreground">
              Alasan akan dikirim ke pengaju agar mereka bisa mengajukan ulang.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          {mode === "APPROVE" ? (
            <Button onClick={onApprove} disabled={loading}>
              <Check className="h-4 w-4" />
              {loading ? "Memproses…" : "Setujui & Buat Jenis"}
            </Button>
          ) : (
            <Button variant="destructive" onClick={onReject} disabled={loading}>
              <X className="h-4 w-4" />
              {loading ? "Memproses…" : "Tolak Pengajuan"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
