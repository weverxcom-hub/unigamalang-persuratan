import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/users — list users (name + email + unit). Used by the disposition
 * UI to pick a target user. Non-super-admins only see users in their own
 * unit.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const where =
    session.role === "SUPER_ADMIN"
      ? undefined
      : session.unitId
        ? { unitId: session.unitId }
        : { id: session.userId };

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, unitId: true },
  });

  return NextResponse.json({ users });
}
