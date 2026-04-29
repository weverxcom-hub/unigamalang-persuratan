import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { unit: { select: { code: true, name: true } } },
  });
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profil Saya</h1>
        <p className="text-sm text-muted-foreground">
          Informasi akun Anda dan ganti kata sandi.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi Akun</CardTitle>
          <CardDescription>
            Email tidak dapat diubah. Hubungi Super Admin untuk perubahan nama, role, atau unit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Nama</dt>
              <dd className="mt-0.5 font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Email</dt>
              <dd className="mt-0.5 break-all font-mono text-xs">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Role</dt>
              <dd className="mt-0.5 font-medium">
                {user.role === "SUPER_ADMIN"
                  ? "Super Admin"
                  : user.role === "ADMIN_UNIT"
                    ? "Admin Unit"
                    : "Pengguna"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Unit</dt>
              <dd className="mt-0.5 font-medium">
                {user.unit ? `${user.unit.code} — ${user.unit.name}` : "Tidak terikat"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ganti Kata Sandi</CardTitle>
          <CardDescription>
            Anda dapat mengganti kata sandi sendiri tanpa bantuan Super Admin. Untuk keamanan,
            sesi lama akan tetap berlaku — keluarkan secara manual jika diperlukan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileClient />
        </CardContent>
      </Card>
    </div>
  );
}
