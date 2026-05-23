import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSidebarBadges } from "@/lib/sidebar-badges";

export const dynamic = "force-dynamic";

/**
 * GET /api/badges — lightweight endpoint for polling sidebar badge counts.
 *
 * Returns the same data as the server-side getSidebarBadges() but accessible
 * from client-side polling. Cached for 30s at the CDN level to avoid
 * hammering the DB.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const badges = await getSidebarBadges(session);
  return NextResponse.json(badges, {
    headers: {
      "Cache-Control": "private, max-age=30",
    },
  });
}
