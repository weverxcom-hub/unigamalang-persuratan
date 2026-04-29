import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { fireWebhook } from "@/lib/webhook";
import { renderDispositionEmail, sendEmail } from "@/lib/email";

const schema = z
  .object({
    toUserId: z.string().nullable().optional(),
    toUnitId: z.string().nullable().optional(),
    instructions: z.string().min(3, "Instruksi wajib diisi"),
    dueDate: z.string().nullable().optional(),
  })
  .refine((v) => v.toUserId || v.toUnitId, {
    message: "Pilih penerima (pengguna atau unit)",
    path: ["toUserId"],
  });

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

function appUrl(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
}

/**
 * GET /api/archives/[id]/dispositions — list dispositions for an archive.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });
  if (
    session.role !== "SUPER_ADMIN" &&
    session.unitId !== archive.unitId
  ) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const rows = await prisma.disposition.findMany({
    where: { archiveId: archive.id },
    orderBy: { createdAt: "desc" },
    include: {
      fromUser: { select: { id: true, name: true, email: true } },
      toUser: { select: { id: true, name: true, email: true } },
      toUnit: { select: { id: true, code: true, name: true } },
    },
  });

  return NextResponse.json({
    dispositions: rows.map((r) => ({
      id: r.id,
      archiveId: r.archiveId,
      fromUserId: r.fromUserId,
      fromUserName: r.fromUser.name,
      toUserId: r.toUserId,
      toUserName: r.toUser?.name ?? null,
      toUnitId: r.toUnitId,
      toUnitName: r.toUnit?.name ?? null,
      instructions: r.instructions,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      status: r.status,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    })),
  });
}

/**
 * POST /api/archives/[id]/dispositions — forward an incoming letter to
 * another user or unit with instructions. Sends an email notification to the
 * target (user if specified, otherwise all admins of the target unit) and
 * fires a webhook.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role === "USER") {
    return NextResponse.json({ error: "Hanya admin yang dapat mendisposisikan surat" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  if (
    session.role !== "SUPER_ADMIN" &&
    session.unitId !== archive.unitId
  ) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const disposition = await prisma.$transaction(async (tx) => {
    const d = await tx.disposition.create({
      data: {
        archiveId: archive.id,
        fromUserId: session.userId,
        toUserId: parsed.data.toUserId ?? null,
        toUnitId: parsed.data.toUnitId ?? null,
        instructions: parsed.data.instructions,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        status: "PENDING",
      },
    });
    await audit(
      {
        action: "DISPOSITION_CREATE",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "Disposition",
        targetId: d.id,
        archiveId: archive.id,
        metadata: {
          number: archive.number,
          toUserId: d.toUserId,
          toUnitId: d.toUnitId,
        },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );
    return d;
  });

  // Post-commit: email + webhook (best effort).
  (async () => {
    try {
      let recipients: { email: string; name: string }[] = [];
      if (disposition.toUserId) {
        const u = await prisma.user.findUnique({
          where: { id: disposition.toUserId },
        });
        if (u) recipients = [{ email: u.email, name: u.name }];
      } else if (disposition.toUnitId) {
        const admins = await prisma.user.findMany({
          where: { unitId: disposition.toUnitId, role: "ADMIN_UNIT" },
        });
        recipients = admins.map((a) => ({ email: a.email, name: a.name }));
      }
      const dueStr = disposition.dueDate
        ? disposition.dueDate.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : null;
      for (const r of recipients) {
        const msg = renderDispositionEmail({
          recipientName: r.name,
          archiveNumber: archive.number,
          subject: archive.subject,
          fromName: session.name,
          instructions: disposition.instructions,
          dueDate: dueStr,
          appUrl: appUrl(req),
          archiveId: archive.id,
        });
        await sendEmail({
          to: r.email,
          subject: `Disposisi · ${archive.number}`,
          html: msg.html,
          text: msg.text,
          tags: [{ name: "event", value: "disposition" }],
        });
      }
      await fireWebhook({
        event: "disposition.created",
        archiveId: archive.id,
        dispositionId: disposition.id,
        archiveNumber: archive.number,
        subject: archive.subject,
        fromUserId: disposition.fromUserId,
        fromUserName: session.name,
        toUserId: disposition.toUserId,
        toUnitId: disposition.toUnitId,
        instructions: disposition.instructions,
        dueDate: disposition.dueDate?.toISOString() ?? null,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[dispositions.POST] post-commit side effects failed", e);
    }
  })();

  return NextResponse.json({ disposition: { id: disposition.id } }, { status: 201 });
}
