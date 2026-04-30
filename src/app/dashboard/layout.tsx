import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardShell } from "@/components/app/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Note: the global RouteProgress bar lives in the root layout so it also
  // covers /login and /register (form submissions trigger it). Don't mount
  // a second instance here.
  return <DashboardShell session={session}>{children}</DashboardShell>;
}
