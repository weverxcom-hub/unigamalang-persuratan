import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardShell } from "@/components/app/sidebar";
import { getSidebarBadges } from "@/lib/sidebar-badges";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Sidebar notification badges (pending letters, disposisi inbox, open
  // tickets). Fetched server-side once per layout render so navigations
  // between dashboard pages reflect the latest counters. Best-effort: helper
  // returns zeros on DB errors instead of crashing the layout.
  const badges = await getSidebarBadges(session);

  // Note: the global RouteProgress bar lives in the root layout so it also
  // covers /login and /register (form submissions trigger it). Don't mount
  // a second instance here.
  return (
    <DashboardShell session={session} badges={badges}>
      {children}
    </DashboardShell>
  );
}
