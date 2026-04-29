import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fireWebhook, WEBHOOK_AVAILABLE } from "@/lib/webhook";

/**
 * POST /api/webhooks/test — fires a synthetic `test.ping` webhook. Useful to
 * validate the n8n / external endpoint is reachable and that the HMAC
 * signature matches on the receiver side.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  if (!WEBHOOK_AVAILABLE) {
    return NextResponse.json(
      {
        error: "WEBHOOK_UNAVAILABLE",
        message:
          "N8N_WEBHOOK_URL belum dikonfigurasi. Setel di environment untuk mengaktifkan webhook.",
      },
      { status: 501 }
    );
  }
  await fireWebhook({
    event: "test.ping",
    triggeredBy: session.email,
    timestamp: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ available: WEBHOOK_AVAILABLE });
}
