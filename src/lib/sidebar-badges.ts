// Server-side helper for sidebar notification badges.
//
// Computes per-user counters for pending items so we can surface a small red
// number next to relevant sidebar entries (Pengarsipan, Disposisi, Tiket
// Laporan, etc.). Designed to be cheap: 3-4 indexed COUNT queries running in
// parallel.
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/types";

export interface SidebarBadges {
  // Number of OUTGOING archives the current user (or their unit, for admins)
  // still has waiting for proof or marked overdue. Used on /dashboard/archives.
  pendingArchives: number;
  // Disposisi addressed to the current user that haven't been acknowledged or
  // completed. Used on /dashboard/dispositions.
  pendingDispositions: number;
  // Help-desk tickets:
  //   - SUPER_ADMIN: count of NEW + IN_PROGRESS tickets across the system
  //     (used on /dashboard/tickets)
  //   - other roles: count of the user's own tickets that are still open
  //     (used on /dashboard/my-tickets)
  openTickets: number;
}

const ZERO: SidebarBadges = {
  pendingArchives: 0,
  pendingDispositions: 0,
  openTickets: 0,
};

export async function getSidebarBadges(
  session: SessionPayload
): Promise<SidebarBadges> {
  try {
    const isSuper = session.role === "SUPER_ADMIN";
    const isAdminUnit = session.role === "ADMIN_UNIT";
    const isUser = session.role === "USER";

    // Archives waiting for proof. Scope:
    //   - SUPER_ADMIN: org-wide
    //   - ADMIN_UNIT: own unit only
    //   - USER: own creations only (PENDING status — admin hasn't approved yet)
    const archivesPromise = (() => {
      if (isSuper) {
        return prisma.archive.count({
          where: {
            deletedAt: null,
            status: { in: ["PENDING_PROOF", "OVERDUE"] },
          },
        });
      }
      if (isAdminUnit) {
        return prisma.archive.count({
          where: {
            deletedAt: null,
            unitId: session.unitId ?? "__none__",
            status: { in: ["PENDING_PROOF", "OVERDUE"] },
          },
        });
      }
      // USER: surface their own PENDING (waiting on admin) so they remember
      // that they have something blocked.
      return prisma.archive.count({
        where: {
          deletedAt: null,
          createdById: session.userId,
          status: { in: ["PENDING", "PENDING_PROOF"] },
        },
      });
    })();

    // Disposisi inbox — anyone can be a recipient, either directly
    // (toUserId) or via their unit (toUnitId), matching the OR the actual
    // inbox query (GET /api/dispositions?box=inbox) uses. Audit L1
    // (2026-08-27): this previously only counted toUserId, so a disposition
    // sent to a user's *unit* was invisible on the sidebar until they
    // opened Disposisi and saw it in the list. We count rows still in
    // PENDING status (user hasn't even acknowledged yet). ACKNOWLEDGED rows
    // are excluded because the user has already seen them.
    const dispositionsPromise = prisma.disposition.count({
      where: {
        status: "PENDING",
        OR: [
          { toUserId: session.userId },
          ...(session.unitId ? [{ toUnitId: session.unitId }] : []),
        ],
      },
    });

    // Tickets:
    //   - SUPER_ADMIN: all NEW + IN_PROGRESS tickets across the system
    //   - others: own tickets that are still open
    const ticketsPromise = isSuper
      ? prisma.ticket.count({
          where: { status: { in: ["NEW", "IN_PROGRESS"] } },
        })
      : prisma.ticket.count({
          where: {
            createdById: session.userId,
            status: { in: ["NEW", "IN_PROGRESS"] },
          },
        });

    const [pendingArchives, pendingDispositions, openTickets] =
      await Promise.all([archivesPromise, dispositionsPromise, ticketsPromise]);

    // Suppress unused-var for `isUser` while keeping the role enum exhaustive.
    void isUser;

    return { pendingArchives, pendingDispositions, openTickets };
  } catch {
    // Sidebar should never crash the layout. If counts fail (e.g. during a
    // schema migration where a model is briefly inconsistent), render zeros
    // and let the user navigate normally.
    return ZERO;
  }
}
