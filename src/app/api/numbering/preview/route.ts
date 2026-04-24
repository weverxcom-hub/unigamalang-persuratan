import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { previewNextNumber } from "@/lib/numbering";

const schema = z.object({
  unitId: z.string().min(1),
  letterTypeId: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }
  const preview = previewNextNumber(parsed.data.unitId, parsed.data.letterTypeId);
  if (!preview) return NextResponse.json({ error: "Unit atau jenis surat tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ preview });
}
