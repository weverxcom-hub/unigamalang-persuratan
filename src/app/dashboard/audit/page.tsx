import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const ACTION_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
  CREATE: { label: "Create", variant: "default" },
  UPDATE: { label: "Update", variant: "secondary" },
  UPLOAD: { label: "Upload", variant: "default" },
  DELETE: { label: "Delete", variant: "destructive" },
  DISPOSITION_CREATE: { label: "Disposisi", variant: "warning" },
  DISPOSITION_UPDATE: { label: "Update Disposisi", variant: "success" },
  RESTORE: { label: "Restore", variant: "secondary" },
  LOGIN: { label: "Login", variant: "secondary" },
  LOGIN_FAILED: { label: "Login Gagal", variant: "warning" },
};

export default async function AuditLogPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Jejak seluruh aksi pada arsip, disposisi, dan pengaturan.
          200 kejadian terbaru ditampilkan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kejadian Terbaru</CardTitle>
          <CardDescription>Dirutkan dari yang terbaru.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Belum ada kejadian.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Waktu</th>
                    <th className="px-4 py-2">Aksi</th>
                    <th className="px-4 py-2">Pelaku</th>
                    <th className="px-4 py-2">Sasaran</th>
                    <th className="px-4 py-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => {
                    const meta = ACTION_LABEL[l.action] ?? { label: l.action, variant: "secondary" as const };
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                          {formatDate(l.createdAt)}{" "}
                          <span className="text-xs">
                            {new Date(l.createdAt).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-2"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                        <td className="px-4 py-2">{l.actorEmail ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs text-muted-foreground">{l.targetType}</span>{" "}
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">{l.targetId ?? "—"}</code>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{l.ip ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
