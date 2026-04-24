import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ArchivesClient } from "./archives-client";

export default async function ArchivesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();

  const visibleUnits =
    session.role === "SUPER_ADMIN" ? db.units : db.units.filter((u) => u.id === session.unitId);

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
        units={visibleUnits}
        letterTypes={db.letterTypes}
        role={session.role}
        sessionUnitId={session.unitId}
      />
    </div>
  );
}
