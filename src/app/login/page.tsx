import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter } from "@/components/app/footer";
import { LoginForm } from "./login-form";
import { SSOButton } from "./sso-button";
import { GoogleButton } from "./google-button";
import { getSession } from "@/lib/auth";
import { ssoAvailable } from "@/lib/sso-client";
import { googleAuthAvailable } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_registered:
    "Email Google ini belum terdaftar di sistem persuratan. Hubungi PIC unit atau Super Admin untuk dibuatkan akun.",
  google_domain:
    "Alamat @unigamalang.ac.id harus masuk dengan akun Google kampus. Pilih akun Google kampus Anda, lalu coba lagi.",
  google_unverified: "Email akun Google ini belum terverifikasi oleh Google.",
  google_deactivated: "Akun ini sudah dinonaktifkan. Hubungi Super Admin.",
  google_cancelled: "Masuk dengan Google dibatalkan.",
  google_failed: "Masuk dengan Google gagal. Silakan coba lagi.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const googleError = error ? GOOGLE_ERRORS[error] : undefined;
  const google = googleAuthAvailable();
  // Already-active session => skip the form. getSession also rejects
  // soft-deleted users so they fall through to the form (and won't loop).
  const session = await getSession();
  if (session) redirect("/dashboard");

  // The button links to the local /auth/sso/start route (not the gateway
  // directly) so a per-attempt CSRF `state` can be generated and stored in
  // a cookie before redirecting to the gateway — see that route's comment.
  const ssoUrl = ssoAvailable() ? "/auth/sso/start" : null;

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
            <CardTitle>Masuk ke Akun</CardTitle>
            <CardDescription>
              Gunakan email institusi <span className="font-semibold text-foreground">@unigamalang.ac.id</span> Anda.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {googleError && (
              <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {googleError}
              </p>
            )}
            {google && (
              <>
                <GoogleButton />
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">atau dengan kata sandi</span>
                  </div>
                </div>
              </>
            )}
            {ssoUrl && (
              <>
                <SSOButton ssoUrl={ssoUrl} />
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">atau login langsung</span>
                  </div>
                </div>
              </>
            )}
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
      </main>
      <SiteFooter />
    </div>
  );
}
