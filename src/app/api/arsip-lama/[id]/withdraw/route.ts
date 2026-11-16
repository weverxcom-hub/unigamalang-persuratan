import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { canModerateOldArchive } from "@/lib/arsip-lama/access";

const schema = z.object({
  reason: z.string().trim().min(10, "Alasan penarikan minimal 10 karakter"),
});

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

/** POST /api/arsip-lama/[id]/withdraw — SUPER_ADMIN only; one-way, no undo. */
export async function POST(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const { id } = await paramsPromise;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (!canModerateOldArchive(session)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  const existing = await prisma.legacyDecree.findUnique({
    where: { id },
    select: { id: true, withdrawnAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
  if (existing.withdrawnAt) {
    return NextResponse.json({ error: "Surat sudah ditarik" }, { status: 409 });
  }

  const reason = parsed.data.reason;
  await prisma.legacyDecree.update({
    where: { id },
    data: {
      withdrawnAt: new Date(),
      withdrawnById: session.userId,
      withdrawnByEmail: session.email,
      withdrawnReason: reason,
      isPublic: false,
    },
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LegacyDecree",
    targetId: id,
    metadata: { event: "withdraw", reason },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
