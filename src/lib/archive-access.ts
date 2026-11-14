import { prisma } from "./prisma";
import { ccReadableWhere } from "./cc";
import type { SessionPayload } from "./types";

/**
 * Who may see an archive's proof file (the scanned/uploaded letter):
 *   - SUPER_ADMIN;
 *   - anyone in the issuing unit;
 *   - a unit in the Tembusan (CC) list, once the archive is ISSUED.
 * Disposition recipients can read the archive record but not the proof.
 */
export async function canViewProof(
  session: SessionPayload,
  archive: { id: string; unitId: string }
): Promise<boolean> {
  if (session.role === "SUPER_ADMIN") return true;
  if (session.unitId && session.unitId === archive.unitId) return true;
  if (session.unitId) {
    const cc = await prisma.archive.findFirst({
      where: { id: archive.id, ...ccReadableWhere(session.unitId) },
      select: { id: true },
    });
    if (cc) return true;
  }
  return false;
}

/** In-app URL that streams a private Drive proof after the access check. */
export function proofFileUrl(archiveId: string): string {
  return `/api/archives/${archiveId}/proof/file`;
}
