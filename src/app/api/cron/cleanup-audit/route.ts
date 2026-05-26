import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cleanup-audit
 *
 * Deletes audit log entries older than 2 years and webhook delivery records
 * older than 90 days. Designed to be called by Vercel Cron (weekly).
 *
 * Security: Protected by CRON_SECRET env var (same as mark-overdue cron).
 */
export async function GET(req: Request) {
  // Validate cron secret to prevent unauthorized access
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  // Audit logs: retain 2 years
  const auditCutoff = new Date(now);
  auditCutoff.setFullYear(auditCutoff.getFullYear() - 2);

  // Webhook deliveries: retain 90 days
  const webhookCutoff = new Date(now);
  webhookCutoff.setDate(webhookCutoff.getDate() - 90);

  const [auditResult, webhookResult] = await Promise.all([
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } },
    }),
    prisma.webhookDelivery.deleteMany({
      where: { createdAt: { lt: webhookCutoff } },
    }),
  ]);

  console.log(
    `[cleanup-audit] Deleted ${auditResult.count} audit logs (before ${auditCutoff.toISOString()}) ` +
    `and ${webhookResult.count} webhook deliveries (before ${webhookCutoff.toISOString()})`
  );

  return NextResponse.json({
    ok: true,
    deletedAuditLogs: auditResult.count,
    deletedWebhookDeliveries: webhookResult.count,
    cutoffs: {
      auditLog: auditCutoff.toISOString(),
      webhookDelivery: webhookCutoff.toISOString(),
    },
  });
}
