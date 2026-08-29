import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ensureLegacyUnits, importLegacyDecrees } from "@/lib/legacy-import";

// POST /api/legacy-decrees/import — SUPER_ADMIN only.
//
// Exists because DATABASE_URL in Vercel is stored as a "Secret" type env
// var, which Vercel makes write-only after creation — nobody, including
// the project owner, can read it back out of the dashboard. That makes
// running prisma/ensure-legacy-units.ts and prisma/import-legacy-decrees.ts
// locally against production impossible without rotating the secret
// (destructive, not worth it for a one-off import). Instead: trigger the
// same logic from inside the already-running server, which always has its
// own DATABASE_URL regardless of whether a human can see it.
//
// Idempotent — safe to click more than once (see importLegacyDecrees).
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  try {
    const units = await ensureLegacyUnits(prisma);
    const result = await importLegacyDecrees(prisma);

    await audit({
      action: "CREATE",
      actorId: session.userId,
      actorEmail: session.email,
      targetType: "LegacyDecree",
      metadata: { units, ...result },
    });

    return NextResponse.json({ units, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/legacy-decrees/import] failed", err);
    const message = err instanceof Error ? err.message : "Gagal menjalankan impor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
