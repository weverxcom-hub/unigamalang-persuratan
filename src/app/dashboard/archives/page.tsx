import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ArchivesClient } from "./archives-client";

export default async function ArchivesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [unitsRaw, letterTypesRaw] = await Promise.all([
    prisma.unit.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.letterType.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
  ]);

  const units = unitsRaw
    .filter((u) => session.role === "SUPER_ADMIN" || u.id === session.unitId)
    .map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      formatTemplate: u.formatTemplate,
      createdAt: u.createdAt.toISOString(),
    }));
  const letterTypes = letterTypesRaw.map((lt) => ({
    id: lt.id,
    code: lt.code,
    name: lt.name,
    createdAt: lt.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pengarsipan Surat</h1>
        <p className="text-sm text-muted-foreground">
          {session.role === "SUPER_ADMIN"
            ? "Arsip persuratan seluruh unit unigamalang."
            : "Arsip persuratan untuk unit Anda."}
        </p>
      </div>
      <ArchivesClient
        units={units}
        letterTypes={letterTypes}
        role={session.role}
        sessionUnitId={session.unitId}
        sessionUserId={session.userId}
      />
    </div>
  );
}
