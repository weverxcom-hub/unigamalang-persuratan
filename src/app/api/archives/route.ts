import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb, saveDb } from "@/lib/db";
import { allocateNextNumber, newArchiveId } from "@/lib/numbering";
import type { Archive } from "@/lib/types";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  const db = getDb();
  const url = new URL(req.url);
  const unit = url.searchParams.get("unitId");
  const letterType = url.searchParams.get("letterTypeId");
  const year = url.searchParams.get("year");
  const q = url.searchParams.get("q")?.toLowerCase();

  let archives = db.archives.slice();

  // Admin Unit / User are scoped to their own unit.
  if (session.role !== "SUPER_ADMIN" && session.unitId) {
    archives = archives.filter((a) => a.unitId === session.unitId);
  }
  if (unit) archives = archives.filter((a) => a.unitId === unit);
  if (letterType) archives = archives.filter((a) => a.letterTypeId === letterType);
  if (year) archives = archives.filter((a) => new Date(a.date).getFullYear().toString() === year);
  if (q) {
    archives = archives.filter(
      (a) =>
        a.number.toLowerCase().includes(q) ||
        a.subject.toLowerCase().includes(q) ||
        a.recipient.toLowerCase().includes(q)
    );
  }

  archives.sort((a, b) => (a.date < b.date ? 1 : -1));

  // Strip the base64 `fileDataUrl` from the list response — it can be up to ~4MB
  // per archive and is only needed when viewing a single proof. Clients receive a
  // `hasProof` boolean instead and fetch the actual data lazily from
  // GET /api/archives/[id]/proof.
  const lightweight = archives.map(({ fileDataUrl, ...rest }) => ({
    ...rest,
    hasProof: !!fileDataUrl,
  }));

  return NextResponse.json({ archives: lightweight });
}

const createSchema = z.object({
  subject: z.string().min(3, "Perihal minimal 3 karakter"),
  recipient: z.string().min(2, "Tujuan wajib diisi"),
  unitId: z.string().min(1),
  letterTypeId: z.string().min(1),
  direction: z.enum(["OUTGOING", "INCOMING"]).default("OUTGOING"),
  date: z.string().optional(),
  fileName: z.string().nullable().optional(),
  fileDataUrl: z.string().nullable().optional(),
  manualNumber: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "PENDING", "PENDING_PROOF", "APPROVED", "ISSUED"]).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // Non super admins can only archive into their own unit.
  if (session.role !== "SUPER_ADMIN" && session.unitId && session.unitId !== input.unitId) {
    return NextResponse.json(
      { error: "Anda hanya dapat mengarsipkan surat untuk unit Anda sendiri" },
      { status: 403 }
    );
  }

  const db = getDb();
  const unit = db.units.find((u) => u.id === input.unitId);
  const letterType = db.letterTypes.find((lt) => lt.id === input.letterTypeId);
  if (!unit || !letterType) {
    return NextResponse.json({ error: "Unit atau jenis surat tidak ditemukan" }, { status: 400 });
  }

  let number: string;
  let sequenceNumber = 0;
  const isManualArchive = Boolean(input.manualNumber && input.manualNumber.trim().length > 0);

  if (isManualArchive) {
    // Manual archive (e.g. historical records / incoming mail).
    number = input.manualNumber!.trim();
  } else {
    const allocated = allocateNextNumber(input.unitId, input.letterTypeId);
    number = allocated.number;
    sequenceNumber = allocated.sequenceNumber;
  }

  // Default flow:
  //  - USER requesting a new number  -> PENDING (needs admin approval)
  //  - Auto-generated number         -> PENDING_PROOF (must upload proof before ISSUED)
  //  - Manual archive with file      -> ISSUED directly
  let defaultStatus: Archive["status"];
  if (session.role === "USER" && !isManualArchive) {
    defaultStatus = "PENDING";
  } else if (!isManualArchive) {
    defaultStatus = "PENDING_PROOF";
  } else {
    defaultStatus = input.fileDataUrl ? "ISSUED" : "PENDING_PROOF";
  }
  const status = input.status ?? defaultStatus;

  const archive: Archive = {
    id: newArchiveId(),
    number,
    date: input.date ? new Date(input.date).toISOString() : new Date().toISOString(),
    subject: input.subject,
    recipient: input.recipient,
    unitId: unit.id,
    unitCode: unit.code,
    letterTypeId: letterType.id,
    letterTypeCode: letterType.code,
    sequenceNumber,
    fileName: input.fileName ?? null,
    fileDataUrl: input.fileDataUrl ?? null,
    direction: input.direction,
    status,
    createdById: session.userId,
    createdAt: new Date().toISOString(),
  };

  db.archives.push(archive);
  saveDb(db);

  return NextResponse.json({ archive }, { status: 201 });
}
