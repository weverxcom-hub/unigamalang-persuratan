import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={64} showWordmark={false} />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Universitas Gajayana</h1>
        <p className="text-sm text-muted-foreground">Sistem Manajemen Persuratan &middot; unigamalang</p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Masuk ke Akun</CardTitle>
          <CardDescription>
            Gunakan email institusi <span className="font-semibold text-foreground">@unigamalang.ac.id</span> Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-40" />}>
            <LoginForm />
          </Suspense>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Belum punya akun?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Daftar di sini
            </Link>
          </p>
        </CardContent>
      </Card>

      <DemoCredentials />
    </main>
  );
}

function DemoCredentials() {
  return (
    <div className="mt-6 w-full max-w-md rounded-lg border bg-muted/40 p-4 text-xs">
      <p className="mb-2 font-semibold text-foreground">Akun demo (prototipe):</p>
      <ul className="space-y-1 text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Super Admin:</span> superadmin@unigamalang.ac.id
        </li>
        <li>
          <span className="font-medium text-foreground">Admin Rektorat:</span> admin.rektorat@unigamalang.ac.id
        </li>
        <li>
          <span className="font-medium text-foreground">Admin Yayasan:</span> admin.yayasan@unigamalang.ac.id
        </li>
        <li>
          <span className="font-medium text-foreground">Pengguna:</span> staff@unigamalang.ac.id
        </li>
        <li className="pt-1">
          <span className="font-medium text-foreground">Password:</span>{" "}
          <code className="rounded bg-background px-1 py-0.5">Password123!</code>
        </li>
      </ul>
    </div>
  );
}
