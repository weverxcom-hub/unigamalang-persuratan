import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Bare layout for printable report pages. Bypasses the dashboard chrome so
 * the page prints exactly as rendered.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <div className="min-h-screen bg-white text-black">{children}</div>;
}
