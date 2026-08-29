import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SiteFooter } from "@/components/app/footer";
import { prisma } from "@/lib/prisma";
import { SkSearch } from "./sk-search";

export const dynamic = "force-dynamic";

// Public, unauthenticated page — no getSession() call anywhere in this
// tree. See src/app/api/publik/sk/route.ts for what data this is allowed
// to surface.
export default async function PublicSkSearchPage() {
  // Only code+name for the filter dropdown — nothing sensitive about the
  // unit list itself, this is just used elsewhere in the app's UI too.
  const units = await prisma.unit.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <main className="flex flex-1 flex-col items-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={64} showWordmark={false} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Pencarian SK &amp; SE</h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            Cari Surat Keputusan atau Surat Edaran Universitas Gajayana Malang sebelum membuat
            yang baru — mungkin sudah pernah diterbitkan.
          </p>
        </div>

        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle>Cari SK / SE</CardTitle>
            <CardDescription>
              Berdasarkan perihal, nomor, unit penerbit, atau tahun. Data 1987–2026 direkap dari
              arsip BP3M; data sejak sistem ini berjalan otomatis terhubung dari arsip resmi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SkSearch units={units} />
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
