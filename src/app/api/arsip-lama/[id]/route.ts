import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  canEditOldArchive,
  canModerateOldArchive,
  canViewOldArchive,
} from "@/lib/arsip-lama/access";
import { changedFields, oldArchiveInput, resolveTanggalRaw } from "@/lib/arsip-lama/input";
import { letterTypeCodeCandidates } from "@/lib/numbering-2027/catalog";

const PUBLIC_REFUSAL = "Hanya SK dan Surat Edaran yang tidak rahasia yang bisa ditampilkan ke publik";

const patchSchema = oldArchiveInput.partial().extend({ isPublic: z.boolean().optional() });

// Fields that do not count as an edit of the letter's data (no editedAt).
const FLAG_FIELDS = new Set(["isPublic", "confidential"]);

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

function canBePublic(letterTypeCode: string, confidential: boolean): boolean {
  if (confidential) return false;
  return (
    letterTypeCodeCandidates("SK").includes(letterTypeCode) ||
    letterTypeCodeCandidates("SE").includes(letterTypeCode)
  );
}

/** GET /api/arsip-lama/[id] — record, file versions (no Drive ids) and edit history. */
export async function GET(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const { id } = await paramsPromise;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const row = await prisma.legacyDecree.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, code: true, name: true } },
      letterType: { select: { id: true, code: true, name: true } },
      files: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!row) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
  if (!canViewOldArchive(session, row)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const { files, ...record } = row;
  const history = await prisma.auditLog.findMany({
    where: { targetType: "LegacyDecree", targetId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { action: true, actorEmail: true, createdAt: true, metadata: true },
  });

  return NextResponse.json({
    record,
    files: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      sha256: f.sha256,
      uploadedByEmail: f.uploadedByEmail,
      uploadedAt: f.uploadedAt,
      replacedAt: f.replacedAt,
      replaceReason: f.replaceReason,
      lastCheckedAt: f.lastCheckedAt,
      lastCheckOk: f.lastCheckOk,
    })),
    history,
  });
}

/** PATCH /api/arsip-lama/[id] — edit data fields and flags. */
export async function PATCH(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const { id } = await paramsPromise;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const existing = await prisma.legacyDecree.findUnique({
    where: { id },
    include: { letterType: { select: { code: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
  if (!canEditOldArchive(session, existing)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const unitChanges = input.unitId !== undefined && input.unitId !== existing.unitId;
  const publicChanges = input.isPublic !== undefined && input.isPublic !== existing.isPublic;
  if ((unitChanges || publicChanges) && !canModerateOldArchive(session)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  let newUnitName: string | null = null;
  if (unitChanges) {
    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, deletedAt: null },
      select: { name: true },
    });
    if (!unit) return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 400 });
    newUnitName = unit.name;
  }

  let letterTypeCode = existing.letterType.code;
  if (input.letterTypeId !== undefined && input.letterTypeId !== existing.letterTypeId) {
    const lt = await prisma.letterType.findFirst({
      where: { id: input.letterTypeId, deletedAt: null },
      select: { code: true },
    });
    if (!lt) return NextResponse.json({ error: "Jenis surat tidak ditemukan" }, { status: 400 });
    letterTypeCode = lt.code;
  }

  const confidential = input.confidential ?? existing.confidential;
  const eligible = canBePublic(letterTypeCode, confidential);
  if (input.isPublic === true && !eligible) {
    return NextResponse.json({ error: PUBLIC_REFUSAL }, { status: 400 });
  }
  // A record that stops being eligible (made confidential, or moved to
  // another letter type) can no longer stay on the public page.
  const isPublic = eligible ? (input.isPublic ?? existing.isPublic) : false;

  const effectiveTanggal =
    input.tanggal !== undefined
      ? input.tanggal
      : existing.tanggal
        ? existing.tanggal.toISOString().slice(0, 10)
        : null;

  const after: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) after[key] = value;
  };
  set("letterTypeId", input.letterTypeId);
  set("unitId", input.unitId);
  if (newUnitName !== null) after.unitLabelRaw = newUnitName;
  set("direction", input.direction);
  set("nomor", input.nomor);
  if (input.tanggal !== undefined) after.tanggal = input.tanggal ? new Date(input.tanggal) : null;
  if (input.tanggalRaw !== undefined) {
    after.tanggalRaw = resolveTanggalRaw(effectiveTanggal, input.tanggalRaw);
  }
  set("perihal", input.perihal);
  set("counterpart", input.counterpart);
  set("physicalLocation", input.physicalLocation);
  set("physicalKind", input.physicalKind);
  set("confidential", input.confidential);
  set("catatan", input.catatan);
  after.isPublic = isPublic;

  const changes = changedFields(existing as unknown as Record<string, unknown>, after);
  const changedKeys = Object.keys(changes);
  if (changedKeys.length === 0) return NextResponse.json({ id, changed: false });

  const data: Record<string, unknown> = {};
  for (const key of changedKeys) data[key] = after[key];
  if (changedKeys.some((k) => !FLAG_FIELDS.has(k))) data.editedAt = new Date();

  await prisma.legacyDecree.update({
    where: { id },
    data: data as Prisma.LegacyDecreeUncheckedUpdateInput,
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LegacyDecree",
    targetId: id,
    metadata: { event: "edit", changes } as Prisma.InputJsonValue,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ id, changed: true });
}
