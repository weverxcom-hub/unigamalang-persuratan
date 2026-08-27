import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter } from "@/components/app/footer";
import { SetupUnitForm } from "./setup-unit-form";

export const metadata = {
  title: "Pilih Unit — Sistem Persuratan",
};

export default async function SetupUnitPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Read fresh from the DB — this page needs to know authProvider, which
  // isn't in the JWT, and a stale unitId in an old cookie shouldn't decide
  // what's rendered here (see audit T-02 on the PATCH endpoint below).
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { unitId: true, authProvider: true },
  });
  if (!user) redirect("/login");
  if (user.unitId) redirect("/dashboard");

  // Self-registered (CREDENTIALS) accounts can't self-assign a unit — a
  // SUPER_ADMIN has to do it (audit T-01). Show a waiting message instead
  // of a picker whose submission the API would reject anyway.
  if (user.authProvider !== "SSO") {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo size={72} showWordmark={false} />
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Akun Terdaftar</h1>
            <p className="text-sm text-muted-foreground">
              Menunggu penetapan unit oleh Super Admin.
            </p>
          </div>

          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Belum Ada Unit</CardTitle>
              <CardDescription>
                Akun Anda berhasil dibuat, tapi belum ada unit kerja yang ditetapkan.
                Super Admin akan menetapkan unit Anda setelah memverifikasi
                pendaftaran. Anda akan bisa mengakses arsip dan fitur persuratan
                setelah unit ditetapkan — silakan hubungi Super Admin jika ini
                berlangsung lama.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const units = await prisma.unit.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={72} showWordmark={false} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Selamat Datang!</h1>
          <p className="text-sm text-muted-foreground">
            Akun Anda berhasil dibuat melalui SSO. Silakan pilih unit Anda.
          </p>
        </div>

        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Pilih Unit</CardTitle>
            <CardDescription>
              Pilih unit kerja Anda agar dapat mengakses arsip dan fitur persuratan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetupUnitForm units={units} />
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
