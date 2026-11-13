import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { NumberingRuleClient } from "./numbering-rule-client";

// SUPER_ADMIN-only: preview and apply the 2027 numbering rule. The work is
// done by /api/numbering/policy; see docs/ATURAN-PENOMORAN-2027.md.
export default async function NumberingRulePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aturan Penomoran</h1>
        <p className="text-sm text-muted-foreground">
          Menerapkan format nomor baru: 40 kode unit berawalan UNIGA, 20 kode jenis surat, dan satu
          template untuk semua unit. Selama belum diterapkan, penomoran berjalan seperti biasa.
        </p>
      </div>
      <NumberingRuleClient />
    </div>
  );
}
