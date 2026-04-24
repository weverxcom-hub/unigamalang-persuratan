import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter } from "@/components/app/footer";
import { RegisterForm } from "./register-form";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  const db = getDb();
  const units = db.units.map((u) => ({ id: u.id, code: u.code, name: u.name }));
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={72} showWordmark={false} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Universitas Gajayana</h1>
          <p className="text-sm text-muted-foreground">Pendaftaran Akun unigamalang</p>
        </div>

        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Daftar Akun Baru</CardTitle>
            <CardDescription>
              Pendaftaran hanya untuk email <span className="font-semibold text-foreground">@unigamalang.ac.id</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm units={units} />
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Sudah punya akun?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Masuk di sini
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
