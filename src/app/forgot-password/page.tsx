import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter } from "@/components/app/footer";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "Lupa Kata Sandi — Sistem Persuratan",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={72} showWordmark={false} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Universitas Gajayana</h1>
          <p className="text-sm text-muted-foreground">Sistem Manajemen Persuratan &middot; unigamalang</p>
        </div>

        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Lupa Kata Sandi</CardTitle>
            <CardDescription>
              Masukkan email institusi Anda. Kami akan mengirimkan link untuk membuat kata sandi baru.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-32" />}>
              <ForgotPasswordForm />
            </Suspense>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Kembali ke halaman login
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
