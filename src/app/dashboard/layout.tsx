import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardShell } from "@/components/app/sidebar";
import { RouteProgress } from "@/components/app/route-progress";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      {/* Suspense required by usePathname/useSearchParams in App Router. */}
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>
      <DashboardShell session={session}>{children}</DashboardShell>
    </>
  );
}
