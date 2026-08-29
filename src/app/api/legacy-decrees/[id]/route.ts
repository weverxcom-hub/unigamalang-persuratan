import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

// PATCH /api/legacy-decrees/[id] — SUPER_ADMIN only: toggle isPublic after
// manually reading a row (perihal + sourceLink) at /dashboard/legacy-decrees.
// This is the human-in-the-loop counterpart to the keyword heuristic in
// prisma/import-legacy-decrees.ts — that script only sets isPublic on
// first import and never touches it again, specifically so a decision
// made here survives a re-import.

const patchSchema = z.object({ isPublic: z.boolean() });

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  const existing = await prisma.legacyDecree.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
  }

  const updated = await prisma.legacyDecree.update({
    where: { id: params.id },
    data: { isPublic: parsed.data.isPublic },
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LegacyDecree",
    targetId: updated.id,
    metadata: {
      noUrutAsli: updated.noUrutAsli,
      perihal: updated.perihal,
      before: { isPublic: existing.isPublic },
      after: { isPublic: updated.isPublic },
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    row: { id: updated.id, isPublic: updated.isPublic },
  });
}
