import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LegacyDecreesClient } from "./legacy-decrees-client";

// SUPER_ADMIN-only review queue for the BP3M legacy SK/SE import — see
// prisma/import-legacy-decrees.ts and src/app/api/publik/sk/route.ts.
// Not gated to a specific unit (unlike ADMIN_UNIT pages) because BP3M
// itself isn't a Unit row in this system; whoever has SUPER_ADMIN can
// review, same access level as /dashboard/audit and /dashboard/tickets.
export default async function LegacyDecreesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const hiddenCount = await prisma.legacyDecree.count({ where: { isPublic: false } });
  const totalCount = await prisma.legacyDecree.count();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review SK Legacy (BP3M)</h1>
        <p className="text-sm text-muted-foreground">
          Data 1987–2026 hasil rekap BP3M yang muncul di{" "}
          <a href="/publik/sk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            pencarian publik
          </a>
          . Baris yang menyebut nama individu atau menyangkut hal personel/disipliner otomatis
          disembunyikan saat impor (heuristik kata kunci) — tinjau di sini dan aktifkan kembali kalau
          ternyata aman ditampilkan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar SK/SE</CardTitle>
          <CardDescription>
            {hiddenCount} dari {totalCount} baris saat ini disembunyikan dari pencarian publik. Cari
            berdasarkan perihal atau nomor, lalu buka link sumber untuk memverifikasi sebelum
            mengubah status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LegacyDecreesClient />
        </CardContent>
      </Card>
    </div>
  );
}
