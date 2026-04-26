import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersClient } from "./users-client";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const [usersRaw, unitsRaw] = await Promise.all([
    // Active users first (deletedAt = NULL), then deactivated. Postgres puts
    // NULLs last by default, so we override to NULLS FIRST.
    prisma.user.findMany({
      orderBy: [{ deletedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    }),
    prisma.unit.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
  ]);

  const users: User[] = usersRaw.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    unitId: u.unitId,
    createdAt: u.createdAt.toISOString(),
    deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
  }));
  const units = unitsRaw.map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    formatTemplate: u.formatTemplate,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manajemen Akun</h1>
        <p className="text-sm text-muted-foreground">
          Tambah, edit role, atau nonaktifkan akun pengguna. Hanya tersedia untuk Super Admin.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pengguna Sistem</CardTitle>
          <CardDescription>
            Akun yang dinonaktifkan tidak dapat login namun riwayat arsip dan disposisi tetap
            tersimpan. Email wajib menggunakan domain <code>@unigamalang.ac.id</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersClient initialUsers={users} units={units} currentUserId={session.userId} />
        </CardContent>
      </Card>
    </div>
  );
}
