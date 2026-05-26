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

  // If user already has a unit, skip to dashboard
  if (session.unitId) redirect("/dashboard");

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
