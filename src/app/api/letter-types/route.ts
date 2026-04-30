import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

// Letter types listing.
//
// Behaviour by query param:
//   /api/letter-types               → all GLOBAL types + (for SUPER_ADMIN) all
//                                     UNIT_SPECIFIC types so the manager UI
//                                     can render them with unit allowlists.
//                                     For ADMIN_UNIT/USER, only types they're
//                                     allowed to use (their unit is in the
//                                     allowlist) are returned.
//   /api/letter-types?unitId=<id>   → letter types available to that unit
//                                     (GLOBAL + types allowlisted to this
//                                     unit). The generate page hits this
//                                     endpoint each time the user changes
//                                     the unit selector.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const url = new URL(req.url);
  const filterUnitId = url.searchParams.get("unitId") || undefined;
  // Non-superadmin requests are silently scoped to the user's own unit
  // regardless of any explicit unitId — IDOR defence.
  const effectiveUnitId =
    session.role === "SUPER_ADMIN" ? filterUnitId : session.unitId ?? "__no_unit__";

  // Build "allowed for this unit" filter:
  //   scope = GLOBAL              OR
  //   scope = UNIT_SPECIFIC AND there is a row in LetterTypeUnit linking it
  //                              to effectiveUnitId
  const where: Prisma.LetterTypeWhereInput = effectiveUnitId
    ? {
        deletedAt: null,
        OR: [
          { scope: "GLOBAL" },
          { scope: "UNIT_SPECIFIC", units: { some: { unitId: effectiveUnitId } } },
        ],
      }
    : { deletedAt: null };

  const letterTypes = await prisma.letterType.findMany({
    where,
    orderBy: { code: "asc" },
    include:
      session.role === "SUPER_ADMIN" && !filterUnitId
        ? { units: { select: { unitId: true } } }
        : undefined,
  });

  return NextResponse.json(
    {
      letterTypes: letterTypes.map((lt) => ({
        id: lt.id,
        code: lt.code,
        name: lt.name,
        scope: lt.scope,
        allowedUnitIds:
          "units" in lt && Array.isArray((lt as { units?: { unitId: string }[] }).units)
            ? (lt as { units: { unitId: string }[] }).units.map((u) => u.unitId)
            : undefined,
        createdAt: lt.createdAt.toISOString(),
      })),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    }
  );
}

const schema = z.object({
  code: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9.-]+$/, "Kode harus huruf kapital/angka (mis. SK, ST)"),
  name: z.string().min(3),
  // Optional scope; defaults to GLOBAL on the server (matching the schema
  // default) so older clients keep working unchanged.
  scope: z.enum(["GLOBAL", "UNIT_SPECIFIC"]).optional(),
  // Required when scope = UNIT_SPECIFIC; ignored otherwise. Array of unit ids
  // the new letter type should be available to.
  unitIds: z.array(z.string().min(1)).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const scope = parsed.data.scope ?? "GLOBAL";
  if (scope === "UNIT_SPECIFIC" && (!parsed.data.unitIds || parsed.data.unitIds.length === 0)) {
    return NextResponse.json(
      { error: "Jenis surat per-unit harus mencantumkan minimal satu unit" },
      { status: 400 }
    );
  }
  const existing = await prisma.letterType.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    if (existing.deletedAt) {
      return NextResponse.json(
        { error: "Kode pernah dipakai (jenis dinonaktifkan). Aktifkan kembali alih-alih membuat baru." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Kode jenis surat sudah digunakan" }, { status: 409 });
  }
  const letterType = await prisma.letterType.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      scope,
      ...(scope === "UNIT_SPECIFIC" && parsed.data.unitIds
        ? {
            units: {
              create: parsed.data.unitIds.map((unitId) => ({ unitId })),
            },
          }
        : {}),
    },
    include: { units: { select: { unitId: true } } },
  });
  await audit({
    action: "CREATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LetterType",
    targetId: letterType.id,
    metadata: {
      code: letterType.code,
      name: letterType.name,
      scope: letterType.scope,
      allowedUnitIds: letterType.units.map((u) => u.unitId),
    },
  });
  return NextResponse.json(
    {
      letterType: {
        id: letterType.id,
        code: letterType.code,
        name: letterType.name,
        scope: letterType.scope,
        allowedUnitIds: letterType.units.map((u) => u.unitId),
        createdAt: letterType.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
