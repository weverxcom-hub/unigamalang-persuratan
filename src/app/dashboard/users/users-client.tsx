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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role, Unit, User } from "@/lib/types";
import { Plus, Pencil, Trash2, RotateCcw, Printer, KeyRound } from "lucide-react";

interface Props {
  initialUsers: User[];
  units: Unit[];
  currentUserId: string;
}

const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN_UNIT", "USER"];

function roleLabel(role: Role) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN_UNIT":
      return "Admin Unit";
    case "USER":
      return "Pengguna";
  }
}

const UNIT_NONE = "__none__";

export function UsersClient({ initialUsers, units, currentUserId }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);

  const unitNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) map.set(u.id, `${u.code} — ${u.name}`);
    return map;
  }, [units]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {users.filter((u) => !u.deletedAt).length} aktif, {users.filter((u) => u.deletedAt).length}{" "}
          dinonaktifkan
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/print/users" target="_blank" rel="noreferrer">
              <Printer className="h-4 w-4" />
              Cetak Daftar
            </a>
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Tambah Akun
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[140px]">Role</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[260px] text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const inactive = !!u.deletedAt;
              return (
                <TableRow key={u.id} className={inactive ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    {u.name}
                    {isSelf && <span className="ml-1 text-xs text-muted-foreground">(Anda)</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "SUPER_ADMIN" ? "default" : "outline"}>
                      {roleLabel(u.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.unitId ? unitNameById.get(u.unitId) ?? "—" : "—"}
                  </TableCell>
                  <TableCell>
                    {inactive ? (
                      <Badge variant="outline" className="border-destructive/50 text-destructive">
                        Nonaktif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-green-500/50 text-green-700">
                        Aktif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetting(u)}>
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset
                    </Button>
                    {inactive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => reactivate(u, setUsers)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Aktifkan
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeactivating(u)}
                        disabled={isSelf}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Nonaktif
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada akun.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {creating && (
        <CreateDialog
          units={units}
          onClose={() => setCreating(false)}
          onCreated={(u) => {
            setUsers((prev) => [...prev, u]);
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EditDialog
          user={editing}
          units={units}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setEditing(null);
          }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => setResetting(null)}
        />
      )}
      {deactivating && (
        <DeactivateDialog
          user={deactivating}
          onClose={() => setDeactivating(null)}
          onDone={() => {
            setUsers((prev) =>
              prev.map((x) =>
                x.id === deactivating.id ? { ...x, deletedAt: new Date().toISOString() } : x
              )
            );
            setDeactivating(null);
          }}
        />
      )}
    </div>
  );
}

async function reactivate(user: User, setUsers: React.Dispatch<React.SetStateAction<User[]>>) {
  const res = await fetch(`/api/users/${user.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reactivate: true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Gagal mengaktifkan akun");
    return;
  }
  const data = await res.json();
  setUsers((prev) => prev.map((x) => (x.id === user.id ? data.user : x)));
}

function CreateDialog({
  units,
  onClose,
  onCreated,
}: {
  units: Unit[];
  onClose: () => void;
  onCreated: (u: User) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [unitId, setUnitId] = useState<string>(UNIT_NONE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email.toLowerCase(),
          password,
          role,
          unitId: unitId === UNIT_NONE ? null : unitId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menambah akun");
        return;
      }
      onCreated(data.user);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Akun Baru</DialogTitle>
          <DialogDescription>
            Email harus berakhiran <code>@unigamalang.ac.id</code>. Pengguna dapat mengganti kata
            sandi setelah login pertama.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">Nama</Label>
            <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="nama@unigamalang.ac.id"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Kata Sandi (min. 8 karakter)</Label>
            <Input
              id="new-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNIT_NONE}>Tanpa unit</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              {loading ? "Menyimpan…" : "Tambah Akun"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  user,
  units,
  isSelf,
  onClose,
  onSaved,
}: {
  user: User;
  units: Unit[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (u: User) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [unitId, setUnitId] = useState<string>(user.unitId ?? UNIT_NONE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          unitId: unitId === UNIT_NONE ? null : unitId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan");
        return;
      }
      onSaved(data.user);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Akun</DialogTitle>
          <DialogDescription>
            Email <code>{user.email}</code> tidak dapat diubah.
            {isSelf && " Anda tidak dapat menurunkan role akun sendiri."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-user-name">Nama</Label>
            <Input
              id="edit-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem
                      key={r}
                      value={r}
                      disabled={isSelf && r !== "SUPER_ADMIN" && user.role === "SUPER_ADMIN"}
                    >
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNIT_NONE}>Tanpa unit</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

function ResetPasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: User;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Gagal reset kata sandi");
        return;
      }
      alert(`Kata sandi ${user.email} berhasil diatur. Sampaikan ke pengguna terkait.`);
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Kata Sandi</DialogTitle>
          <DialogDescription>
            Atur kata sandi baru untuk <strong>{user.name}</strong> ({user.email}). Sampaikan ke
            yang bersangkutan dan minta untuk segera mengganti.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">Kata Sandi Baru (min. 8 karakter)</Label>
            <Input
              id="reset-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
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
              {loading ? "Menyimpan…" : "Simpan Kata Sandi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({
  user,
  onClose,
  onDone,
}: {
  user: User;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Gagal menonaktifkan akun");
        return;
      }
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nonaktifkan akun?</DialogTitle>
          <DialogDescription>
            Akun <strong>{user.name}</strong> ({user.email}) tidak akan bisa login lagi. Riwayat
            arsip dan disposisi tetap tersimpan dan dapat ditelusuri di Audit Log.
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
            {loading ? "Memproses…" : "Nonaktifkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
